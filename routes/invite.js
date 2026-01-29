// routes/invite.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

const rewards = {
  1: { points: 100, xp: 1 },
  3: { points: 500, xp: 2 },
  5: { points: 1000, xp: 3 },
  10: { points: 2500, xp: 5 }
};

/**
 * POST /invite/register
 * Called when a new user joins via startapp code
 * Body: { inviteCode, newUserId }
 */
router.post('/register', async (req, res) => {
  try {
    const { inviteCode, newUserId } = req.body;
    if (!inviteCode || !newUserId) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    const newUser = await User.findOne({ userId: newUserId });
    if (!newUser) return res.status(404).json({ error: "New user not found" });

    // Prevent double registration
    if (newUser.invitedBy) {
      return res.json({ message: "Invite already processed" });
    }

    const inviter = await User.findOne({ inviteCode });
    if (!inviter || inviter.userId === newUserId) {
      return res.status(400).json({ error: "Invalid invite code" });
    }

    // Link users
    newUser.invitedBy = inviter.userId;
    newUser.points = (newUser.points || 0) + 100; // Welcome bonus
    await newUser.save();

    inviter.invitedCount = (inviter.invitedCount || 0) + 1;
    await inviter.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Invite register error:", err);
    res.status(500).json({ error: "Invite registration failed" });
  }
});

/**
 * GET /invite/progress/:userId
 */
router.get('/progress/:userId', async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    invitedCount: user.invitedCount || 0,
    completedTasks: user.completedInviteTasks || []
  });
});

/**
 * GET /invite/verify/:userId?target=3
 */
router.get('/verify/:userId', async (req, res) => {
  const target = parseInt(req.query.target, 10);
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  const completed = (user.invitedCount || 0) >= target;
  const claimed = user.completedInviteTasks?.includes(target) || false;

  res.json({ completed, claimed });
});

/**
 * POST /invite/claim/:userId?target=3
 */
router.post('/claim/:userId', async (req, res) => {
  const target = parseInt(req.query.target, 10);
  const reward = rewards[target];
  if (!reward) return res.status(400).json({ error: "Invalid target" });

  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  if ((user.invitedCount || 0) < target) {
    return res.status(400).json({ error: "Target not reached" });
  }

  if (user.completedInviteTasks?.includes(target)) {
    return res.status(400).json({ error: "Already claimed" });
  }

  user.points += reward.points;
  user.xp += reward.xp;
  user.completedInviteTasks = user.completedInviteTasks || [];
  user.completedInviteTasks.push(target);

  await user.save();
  res.json({ success: true });
});

/**
 * GET /invite/:userId
 * Must be LAST to avoid route collision
 */
router.get('/:userId', async (req, res) => {
  const user = await User.findOne({ userId: req.params.userId });
  if (!user) return res.status(404).json({ error: "User not found" });

  const inviteLink = `https://t.me/hope_official_bot/app?startapp=${user.inviteCode}`;
  res.json({ inviteLink });
});

router.get('/top-referrers', async (req, res) => {
  try {
    const top = await User.find({})
      .sort({ invitedCount: -1 })
      .limit(50)
      .select('telegramId username invitedCount');

    res.json(top.map(u => ({
      userId: u.telegramId,
      username: u.username,
      referrals: u.invitedCount || 0
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to load referral leaderboard' });
  }
});


module.exports = router;
