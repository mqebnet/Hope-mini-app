const express = require('express');
const router = express.Router();
const User = require('../models/User');

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

    res.json({
      success: true,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        points: user.points,
        level: user.level,
        streak: user.streak,
        xp: user.xp,
        bronzeTickets: user.bronzeTickets,
        silverTickets: user.silverTickets,
        goldTickets: user.goldTickets,
        lastCheckInDate: user.lastCheckInDate,
        miningStartedAt: user.miningStartedAt
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
