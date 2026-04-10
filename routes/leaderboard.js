const express = require('express');
const router = express.Router();
const User = require('../models/User');

const LEADERBOARD_TTL_SECONDS = 60;

async function getCachedLeaderboard(redisClient, levelIndex) {
  if (!redisClient) return null;
  try {
    const raw = await redisClient.get(`leaderboard:${levelIndex}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setCachedLeaderboard(redisClient, levelIndex, data) {
  if (!redisClient) return;
  try {
    await redisClient.set(
      `leaderboard:${levelIndex}`,
      JSON.stringify(data),
      { EX: LEADERBOARD_TTL_SECONDS }
    );
  } catch {
    // non-fatal
  }
}

const LEVEL_MAP = {
  1: 'Seeker',
  2: 'Dreamer',
  3: 'Believer',
  4: 'Challenger',
  5: 'Navigator',
  6: 'Ascender',
  7: 'Master',
  8: 'Grandmaster',
  9: 'Legend',
  10: 'Eldrin'
};

function serializeLeaderboardUser(user) {
  return {
    telegramId: user.telegramId,
    username: user.username,
    xp: user.xp || 0,
    points: user.points || 0,
    level: user.level,
    streak: user.streak || 0
  };
}

async function getCurrentUserRankForLevel(telegramId, levelName) {
  if (!Number.isFinite(telegramId)) return null;

  const currentUser = await User.findOne({ telegramId })
    .select('telegramId username xp points level streak')
    .lean();

  if (!currentUser || currentUser.level !== levelName) {
    return null;
  }

  const xp = Number(currentUser.xp || 0);
  const points = Number(currentUser.points || 0);
  const higherRankedCount = await User.countDocuments({
    level: levelName,
    $or: [
      { xp: { $gt: xp } },
      { xp, points: { $gt: points } },
      { xp, points, telegramId: { $lt: telegramId } }
    ]
  });

  return {
    ...serializeLeaderboardUser(currentUser),
    rank: higherRankedCount + 1
  };
}

router.get('/by-level/:levelIndex', async (req, res) => {
  const levelIndex = Number(req.params.levelIndex);
  const levelName = LEVEL_MAP[levelIndex];
  if (!levelName) return res.status(400).json({ error: 'Invalid level' });

  try {
    const redisClient = req.app.locals.redisClient || null;

    let responseData = await getCachedLeaderboard(redisClient, levelIndex);
    if (!responseData) {
      const users = await User.find({ level: levelName })
        .sort({ xp: -1, points: -1, telegramId: 1 })
        .limit(100)
        .select('telegramId username xp points level streak')
        .lean();

      responseData = {
        levelIndex,
        levelName,
        users: users.map(serializeLeaderboardUser)
      };

      await setCachedLeaderboard(redisClient, levelIndex, responseData);
    }

    const currentUser = await getCurrentUserRankForLevel(Number(req.user?.telegramId), levelName);

    res.json({
      ...responseData,
      currentUser
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

module.exports = router;
