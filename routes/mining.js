// routes/mining.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getUserLevel } = require('../utils/levelUtil');

const MINING_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

router.post('/start', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.miningStartedAt) {
      return res.status(400).json({ error: 'Mining already active' });
    }

    user.miningStartedAt = new Date();
    user.miningReminderSentAt = null;
    await user.save();

    res.json({
      success: true,
      miningStartedAt: user.miningStartedAt,
      durationMs: MINING_DURATION_MS
    });
  } catch (err) {
    console.error('Start mining error:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/claim', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user || !user.miningStartedAt) {
      return res.status(400).json({ error: 'No active mining' });
    }

    const elapsed = Date.now() - user.miningStartedAt.getTime();
    if (elapsed < MINING_DURATION_MS) {
      return res.status(403).json({ error: 'Mining not complete' });
    }

    user.points += 250;
    user.miningStartedAt = null;
    user.lastMiningClaim = new Date();
    user.miningReminderSentAt = null;
    user.level = getUserLevel(user.points);
    await user.save();

    res.json({
      success: true,
      points: user.points,
      level: user.level
    });
  } catch (err) {
    console.error('Claim mining error:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
