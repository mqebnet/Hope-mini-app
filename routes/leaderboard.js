const express = require('express');
const router = express.Router();
const User = require('../models/User');

const LEADERBOARD_TTL_SECONDS = 60;

async function getCachedLeaderboard(redisClient, levelIndex) {
  if (!redisClient) return null;
  try {
    const raw = await redisClient.get(`leaderboard:${levelIndex}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function setCachedLeaderboard(redisClient, levelIndex, data) {
  if (!redisClient) return;
  try {
    await redisClient.set(
      `leaderboard:${levelIndex}`,
      JSON.stringify(data),
      { EX: LEADERBOARD_TTL_SECONDS }
    );
  } catch { /* non-fatal */ }
}

async function invalidateLeaderboardCache(redisClient, levelIndex) {
  if (!redisClient) return;
  try {
    if (levelIndex !== undefined) {
      await redisClient.del(`leaderboard:${levelIndex}`);
    } else {
      // Invalidate all 10 levels
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          redisClient.del(`leaderboard:${i + 1}`)
        )
      );
    }
  } catch { /* non-fatal */ }
}

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
  if (!levelName) return res.status(400).json({ error: 'Invalid level' });

  try {
    const redisClient = req.app.locals.redisClient || null;

    const cached = await getCachedLeaderboard(redisClient, levelIndex);
    if (cached) return res.json(cached);

    const users = await User.find({ level: levelName })
      .sort({ xp: -1, points: -1 })
      .limit(100)
      .select('telegramId username xp points level streak')
      .lean();

    const responseData = {
      levelIndex,
      levelName,
      users: users.map((u) => ({
        telegramId: u.telegramId,
        username: u.username,
        xp: u.xp || 0,
        points: u.points || 0,
        level: u.level,
        streak: u.streak || 0
      }))
    };

    await setCachedLeaderboard(redisClient, levelIndex, responseData);
    res.json(responseData);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

module.exports = router;
