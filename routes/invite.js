// routes/invite.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Referral = require('../models/Referral');
const { generateUniqueInviteCode } = require('../utils/inviteCode');
const { getUserLevel } = require('../utils/levelUtil');
const stateEmitter = require('../utils/stateEmitter');
const { applyReferralAttribution } = require('../utils/referral');

const rewards = {
  1: { points: 100, xp: 1 },
  3: { points: 500, xp: 2 },
  5: { points: 1000, xp: 3 },
  10: { points: 2500, xp: 5 }
};

async function reconcileInviteState(user) {
  const counted = Number(user?.invitedCount || 0);
  const [referralsCount, legacyInvitedByCount] = await Promise.all([
    Referral.countDocuments({ inviterId: user.telegramId }),
    User.countDocuments({ invitedBy: user.telegramId })
  ]);
  const effectiveInvitedCount = Math.max(counted, referralsCount, legacyInvitedByCount);
  let touched = false;
  if (effectiveInvitedCount !== counted) {
    user.invitedCount = effectiveInvitedCount;
    touched = true;
  }

  if (touched) {
    await user.save();
  }

  return {
    invitedCount: effectiveInvitedCount,
    referralsCount,
    directInviteCount: legacyInvitedByCount
  };
}

router.post('/register', async (req, res) => {
  try {
    const { inviteCode, newUserId } = req.body;
    const newUserTelegramId = Number(newUserId);

    if (!inviteCode || !newUserTelegramId) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const newUser = await User.findOne({ telegramId: newUserTelegramId });
    if (!newUser) return res.status(404).json({ error: 'New user not found' });

    if (newUser.invitedBy) {
      return res.json({ message: 'Invite already processed' });
    }

    const inviter = await User.findOne({ inviteCode });
    if (!inviter || inviter.telegramId === newUserTelegramId) {
      return res.status(400).json({ error: 'Invalid invite code' });
    }

    newUser.invitedBy = inviter.telegramId;
    newUser.points = (newUser.points || 0) + 100;
    newUser.level = getUserLevel(newUser.points);
    await newUser.save();

    const referralResult = await Referral.updateOne(
      { invitedId: newUserTelegramId },
      {
        $setOnInsert: {
          inviterId: inviter.telegramId,
          invitedId: newUserTelegramId,
          joinedAt: new Date()
        }
      },
      { upsert: true }
    );
    if (Number(referralResult?.upsertedCount || 0) > 0) {
      inviter.invitedCount = (inviter.invitedCount || 0) + 1;
    }
    await inviter.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Invite register error:', err);
    res.status(500).json({ error: 'Invite registration failed' });
  }
});

// Called when an authenticated returning user opens the app via an invite link.
router.post('/register-session', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const startParam = typeof req.body?.startParam === 'string' ? req.body.startParam.trim() : '';
    if (!startParam) return res.json({ skipped: true });

    const user = await User.findOne({ telegramId });
    if (!user || user.invitedBy) return res.json({ skipped: true });

    await applyReferralAttribution(user, startParam);
    res.json({ success: true });
  } catch (err) {
    res.json({ skipped: true });
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
    const inviteLink = `https://t.me/hope_official_bot/app?startapp=${startParam}`;
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
    const top = await User.aggregate([
      {
        $project: {
          telegramId: 1,
          username: 1,
          invitedCount: { $ifNull: ['$invitedCount', 0] }
        }
      },
      {
        $lookup: {
          from: 'referrals',
          let: { ownerTelegramId: '$telegramId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$inviterId', '$$ownerTelegramId'] }
              }
            },
            { $count: 'count' }
          ],
          as: 'referralRows'
        }
      },
      {
        $addFields: {
          referralsCount: {
            $ifNull: [{ $arrayElemAt: ['$referralRows.count', 0] }, 0]
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          let: { ownerTelegramId: '$telegramId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $eq: ['$invitedBy', '$$ownerTelegramId']
                }
              }
            },
            { $count: 'count' }
          ],
          as: 'directInvites'
        }
      },
      {
        $addFields: {
          directInviteCount: {
            $ifNull: [{ $arrayElemAt: ['$directInvites.count', 0] }, 0]
          }
        }
      },
      {
        $addFields: {
          effectiveReferrals: { $max: ['$invitedCount', '$referralsCount', '$directInviteCount'] }
        }
      },
      { $sort: { effectiveReferrals: -1, telegramId: 1 } },
      { $limit: 50 }
    ]);

    res.json(top.map((u) => ({
      userId: u.telegramId,
      username: u.username,
      referrals: u.effectiveReferrals || 0
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load referral leaderboard' });
  }
});

// legacy route that returned another user's invite link; intentionally
// removed since current design only exposes authenticated user's link
// router.get('/:userId', ...)


module.exports = router;
