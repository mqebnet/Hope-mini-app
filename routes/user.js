const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getNextLevelThreshold, getUserLevel } = require('../utils/levelUtil');
const {
  normalizeStreakIfMissed,
  getCheckInDayKey,
  getNextResetAtUtc
} = require('../utils/dailyCheckIn');

/**
 * GET current authenticated user
 * Route: GET /api/user/me
 */
router.get('/me', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;

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
    }
    const todayDayKey = getCheckInDayKey(now);
    const checkedInToday = (user.checkIns || []).some((c) => c.dayKey === todayDayKey);

    res.json({
      success: true,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        isAdmin: Boolean(user.isAdmin),
        points: user.points,
        level: user.level,
        streak: user.streak,
        xp: user.xp,
        bronzeTickets: user.bronzeTickets,
        silverTickets: user.silverTickets,
        goldTickets: user.goldTickets,
        lastCheckInDate: user.lastCheckInDate,
        checkIns: user.checkIns || [],
        badges: user.badges || [],
        checkedInToday,
        dailyCheckInResetAtUtc: getNextResetAtUtc(now).toISOString(),
        miningStartedAt: user.miningStartedAt,
        nextLevelAt: getNextLevelThreshold(user.points || 0)
      }
    });
  } catch (error) {
    console.error('User fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user data'
    });
  }
});

module.exports = router;
