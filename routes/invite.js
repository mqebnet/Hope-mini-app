// routes/invite.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Referral = require('../models/Referral');
const { generateUniqueInviteCode } = require('../utils/inviteCode');
const { getUserLevel } = require('../utils/levelUtil');
const stateEmitter = require('../utils/stateEmitter');
const { applyReferralAttribution } = require('../utils/referral');
const TELEGRAM_BOT_USERNAME = (process.env.TELEGRAM_BOT_USERNAME || 'hope_official_bot').replace(/^@/, '');
const TELEGRAM_MINI_APP_SHORT_NAME = (process.env.TELEGRAM_MINI_APP_SHORT_NAME || 'Hope')
  .trim()
  .replace(/^\/+|\/+$/g, '');

const rewards = {
  1: { points: 500, xp: 1 },
  3: { points: 2000, xp: 2 },
  5: { points: 3000, xp: 3 },
  10: { points: 4500, xp: 5 }
};

async function reconcileInviteState(user) {
  const referralsCount = await Referral.countDocuments({ inviterId: user.telegramId });
  const cachedCount = Number(user?.invitedCount || 0);

  if (referralsCount !== cachedCount) {
    user.invitedCount = referralsCount;
    await user.save();
  }

  return {
    invitedCount: referralsCount
  };
}

// Called when an authenticated returning user opens the app via an invite link.
router.post('/register-session', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const startParam = typeof req.body?.startParam === 'string' ? req.body.startParam.trim() : '';
    if (!startParam) return res.json({ success: true, applied: false, reason: 'missing-start-param' });

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.invitedBy) {
      return res.json({ success: true, applied: false, reason: 'already-attributed' });
    }

    const result = await applyReferralAttribution(user, startParam);
    res.json({
      success: true,
      applied: Boolean(result?.applied),
      reason: result?.reason || null,
      inviterTelegramId: result?.inviterTelegramId || null,
      inviterUsername: result?.inviterUsername || null,
      bonusAmount: Number(result?.inviteeRewardPoints || 0),
      bonusBronzeTickets: Number(result?.inviteeRewardBronzeTickets || 0),
      inviterUpdated: Number(result?.inviterUpdated || 0)
    });
  } catch (err) {
    console.error('Invite register-session error:', err);
    res.status(500).json({ error: 'Invite session registration failed' });
  }
});

// helper endpoint for development: backfill missing invite codes
router.post('/ensure-codes', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Forbidden in production' });
  }
  const users = await User.find({ $or: [{ inviteCode: { $exists: false } }, { inviteCode: null }] });
  let count = 0;
  for (const u of users) {
    u.inviteCode = await generateUniqueInviteCode();
    await u.save();
    count++;
  }
  res.json({ updated: count });
});

// return invite link for the authenticated user
router.get('/link', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.inviteCode) {
      user.inviteCode = await generateUniqueInviteCode();
      await user.save();
    }

    const startParam = `${user.telegramId}_${user.inviteCode}`;
    const inviteLink = `https://t.me/${TELEGRAM_BOT_USERNAME}/${TELEGRAM_MINI_APP_SHORT_NAME}?startapp=${encodeURIComponent(startParam)}`;
    res.json({ inviteLink });
  } catch (err) {
    console.error('Invite link error:', err);
    res.status(500).json({ error: 'Unable to fetch invite link' });
  }
});

// progress endpoint for authenticated user
// frontend calls /api/invite/progress without params
router.get('/progress', async (req, res) => {
  const telegramId = req.user.telegramId;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { invitedCount: effectiveInvitedCount } = await reconcileInviteState(user);

  const completedInviteTasks = Array.isArray(user.completedInviteTasks)
    ? user.completedInviteTasks.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : [];

  res.json({
    invitedCount: effectiveInvitedCount,
    completedTasks: completedInviteTasks,
    points: user.points || 0,
    xp: user.xp || 0,
    level: user.level
  });
});

router.get('/verify', async (req, res) => {
  const target = parseInt(req.query.target, 10);
  if (!Number.isFinite(target)) return res.status(400).json({ error: 'Invalid target' });
  const telegramId = req.user.telegramId;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { invitedCount: effectiveInvitedCount } = await reconcileInviteState(user);

  const completed = effectiveInvitedCount >= target;
  const claimed = Array.isArray(user.completedInviteTasks)
    ? user.completedInviteTasks.map((v) => Number(v)).includes(target)
    : false;

  res.json({ completed, claimed });
});

router.post('/claim', async (req, res) => {
  const target = parseInt(req.query.target, 10);
  const reward = rewards[target];
  if (!reward) return res.status(400).json({ error: 'Invalid target' });

  const telegramId = req.user.telegramId;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: 'User not found' });
  const { invitedCount: effectiveInvitedCount } = await reconcileInviteState(user);

  if (effectiveInvitedCount < target) {
    return res.status(400).json({ error: 'Target not reached' });
  }

  user.completedInviteTasks = Array.isArray(user.completedInviteTasks)
    ? user.completedInviteTasks.map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : [];

  if (user.completedInviteTasks.includes(target)) {
    return res.status(400).json({ error: 'Already claimed' });
  }

  user.points = (user.points || 0) + reward.points;
  user.xp = (user.xp || 0) + reward.xp;
  user.level = getUserLevel(user.points);
  user.completedInviteTasks.push(target);

  await user.save();
  stateEmitter.emit('user:updated', {
    telegramId: user.telegramId,
    points: user.points,
    xp: user.xp,
    level: user.level,
    nextLevelAt: user.nextLevelAt,
    bronzeTickets: user.bronzeTickets || 0,
    silverTickets: user.silverTickets || 0,
    goldTickets: user.goldTickets || 0,
    streak: user.streak || 0,
    miningStartedAt: user.miningStartedAt
  });
  res.json({
    success: true,
    reward,
    user: {
      points: user.points,
      xp: user.xp,
      level: user.level,
      invitedCount: effectiveInvitedCount,
      completedInviteTasks: user.completedInviteTasks
    }
  });
});

router.get('/top-referrers', async (req, res) => {
  try {
    const top = await Referral.aggregate([
      {
        $group: {
          _id: '$inviterId',
          referrals: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          let: { inviterTelegramId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$telegramId', '$$inviterTelegramId'] }
              }
            },
            {
              $project: {
                _id: 0,
                telegramId: 1,
                username: 1
              }
            }
          ],
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      { $sort: { referrals: -1, _id: 1 } },
      { $limit: 50 }
    ]);

    res.json(top.map((u) => ({
      userId: u.user.telegramId,
      username: u.user.username,
      referrals: Number(u.referrals || 0)
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load referral leaderboard' });
  }
});

// legacy route that returned another user's invite link; intentionally
// removed since current design only exposes authenticated user's link
// router.get('/:userId', ...)


module.exports = router;
