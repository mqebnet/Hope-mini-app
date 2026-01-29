const express = require('express');
const router = express.Router();
const User = require('../models/User');

const LEVEL_MAP = {
  1: "Seeker",
  2: "Dreamer",
  3: "Believer",
  4: "Challenger",
  5: "Navigator",
  6: "Ascender",
  7: "Master",
  8: "Grandmaster",
  9: "Legend",
  10: "Eldrin"
};

// GET top 100 users for a level (1–10)
router.get('/by-level/:levelIndex', async (req, res) => {
  const levelIndex = Number(req.params.levelIndex);
  const levelName = LEVEL_MAP[levelIndex];

  if (!levelName) {
    return res.status(400).json({ error: 'Invalid level' });
  }

  try {
    const users = await User.find({ level: levelName })
      .sort({ xp: -1, points: -1 }) // XP first, then points
      .limit(100)
      .select('telegramId username xp points level transactionsCount');

    res.json({
      levelIndex,
      levelName,
      users
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

module.exports = router;
