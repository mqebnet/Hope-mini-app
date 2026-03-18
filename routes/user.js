const express = require('express');
const router = express.Router();
const User = require('../models/User');
const CompletedTask = require('../models/CompletedTask');
const { getNextLevelThreshold, getUserLevel } = require('../utils/levelUtil');
const {
  normalizeStreakIfMissed,
  getCheckInDayKey,
  getNextResetAtUtc,
  getUserCheckIns,
  getUserBadges
} = require('../utils/dailyCheckIn');

const userDataCache = new Map();
const USER_CACHE_TTL_MS = 30 * 1000; // 30 seconds

// Call this after any write that changes user data (points, tickets, level etc.)
// so the next read gets fresh data instead of a stale cached response.
function invalidateUserCache(telegramId) {
  userDataCache.delete(telegramId);
}

/**
 * GET current authenticated user
 * Route: GET /api/user/me
 */
router.get('/me', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const cached = userDataCache.get(telegramId);
    if (cached && Date.now() - cached.ts < USER_CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const user = await User.findOne({ telegramId })
      .select('-__v -createdAt -updatedAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const now = new Date();
    const streakChanged = normalizeStreakIfMissed(user, now);
    const calculatedLevel = getUserLevel(user.points || 0);
    const levelChanged = user.level !== calculatedLevel;
    if (levelChanged) {
      user.level = calculatedLevel;
    }
    if (streakChanged || levelChanged) {
      await user.save();
      invalidateUserCache(telegramId);
    }
    const [checkIns, badges, completedTaskDocs] = await Promise.all([
      getUserCheckIns(user.telegramId, 120),
      getUserBadges(user.telegramId),
      CompletedTask.find({ telegramId: user.telegramId }, { taskId: 1, _id: 0 }).lean()
    ]);

    const todayDayKey = getCheckInDayKey(now);
    const checkedInToday = checkIns.some((c) => c.dayKey === todayDayKey);

    const responseData = {
      success: true,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        isAdmin: Boolean(user.isAdmin),
        wallet: user.wallet,
        points: user.points,
        level: user.level,
        streak: user.streak,
        xp: user.xp,
        bronzeTickets: user.bronzeTickets,
        silverTickets: user.silverTickets,
        goldTickets: user.goldTickets,
        lastCheckInDate: user.lastCheckInDate,
        checkIns,
        badges,
        completedTasks: completedTaskDocs.map((doc) => doc.taskId),
        checkedInToday,
        dailyCheckInResetAtUtc: getNextResetAtUtc(now).toISOString(),
        miningStartedAt: user.miningStartedAt,
        nextLevelAt: getNextLevelThreshold(user.points || 0)
      }
    };

    userDataCache.set(telegramId, { data: responseData, ts: Date.now() });
    res.json(responseData);
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user data'
    });
  }
});

// POST /api/user/wallet - save connected TON wallet address to user record
router.post('/wallet', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { wallet } = req.body;

    if (!wallet || typeof wallet !== 'string' || wallet.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const user = await User.findOneAndUpdate(
      { telegramId },
      { $set: { wallet: wallet.trim() } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });
    invalidateUserCache(telegramId);

    res.json({ success: true, wallet: user.wallet });
  } catch (err) {
    console.error('Save wallet error:', err);
    res.status(500).json({ error: 'Failed to save wallet address' });
  }
});

module.exports = router;
