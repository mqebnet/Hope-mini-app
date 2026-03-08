const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');

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
      .select('telegramId username xp points level')
      .lean();

    const telegramIds = users.map((u) => u.telegramId);
    const txCountsAgg = telegramIds.length
      ? await Transaction.aggregate([
        { $match: { telegramId: { $in: telegramIds }, status: 'verified' } },
        { $group: { _id: '$telegramId', count: { $sum: 1 } } }
      ])
      : [];
    const txCountMap = new Map(txCountsAgg.map((row) => [Number(row._id), Number(row.count || 0)]));

    const mappedUsers = users.map((u) => ({
      telegramId: u.telegramId,
      username: u.username,
      xp: u.xp || 0,
      points: u.points || 0,
      level: u.level,
      transactionsCount: txCountMap.get(Number(u.telegramId)) || 0
    }));

    res.json({
      levelIndex,
      levelName,
      users: mappedUsers
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

module.exports = router;
