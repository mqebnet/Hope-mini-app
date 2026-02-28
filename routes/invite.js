// routes/invite.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateUniqueInviteCode } = require('../utils/inviteCode');

const rewards = {
  1: { points: 100, xp: 1 },
  3: { points: 500, xp: 2 },
  5: { points: 1000, xp: 3 },
  10: { points: 2500, xp: 5 }
};

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
    await newUser.save();

    inviter.invitedCount = (inviter.invitedCount || 0) + 1;
    await inviter.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Invite register error:', err);
    res.status(500).json({ error: 'Invite registration failed' });
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

    const inviteLink = `https://t.me/hope_official_bot/app?startapp=${user.inviteCode}`;
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

  res.json({
    invitedCount: user.invitedCount || 0,
    completedTasks: user.completedInviteTasks || []
  });
});

router.get('/verify', async (req, res) => {
  const target = parseInt(req.query.target, 10);
  const telegramId = req.user.telegramId;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const completed = (user.invitedCount || 0) >= target;
  const claimed = user.completedInviteTasks?.includes(target) || false;

  res.json({ completed, claimed });
});

router.post('/claim', async (req, res) => {
  const target = parseInt(req.query.target, 10);
  const reward = rewards[target];
  if (!reward) return res.status(400).json({ error: 'Invalid target' });

  const telegramId = req.user.telegramId;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ error: 'User not found' });

  if ((user.invitedCount || 0) < target) {
    return res.status(400).json({ error: 'Target not reached' });
  }

  if (user.completedInviteTasks?.includes(target)) {
    return res.status(400).json({ error: 'Already claimed' });
  }

  user.points += reward.points;
  user.xp += reward.xp;
  user.completedInviteTasks = user.completedInviteTasks || [];
  user.completedInviteTasks.push(target);

  await user.save();
  res.json({ success: true });
});

router.get('/top-referrers', async (req, res) => {
  try {
    const top = await User.find({})
      .sort({ invitedCount: -1 })
      .limit(50)
      .select('telegramId username invitedCount');

    res.json(top.map((u) => ({
      userId: u.telegramId,
      username: u.username,
      referrals: u.invitedCount || 0
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load referral leaderboard' });
  }
});

// legacy route that returned another user's invite link; intentionally
// removed since current design only exposes authenticated user's link
// router.get('/:userId', ...)


module.exports = router;
