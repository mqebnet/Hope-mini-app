// routes/me.js
const express = require('express');
const User = require('../models/User');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // req.user is guaranteed by apiAuth
    const user = await User.findOne(
      { telegramId: req.user.telegramId },
      {
        _id: 0,
        telegramId: 1,
        username: 1,
        points: 1,
        level: 1,
        xp: 1,
        streak: 1,
        bronzeTickets: 1,
        silverTickets: 1,
        goldTickets: 1,
        lastMiningClaim: 1,
        miningStartedAt: 1,
        createdAt: 1
      }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      ok: true,
      authenticated: true,
      user
    });
  } catch (err) {
    console.error('GET /api/me error:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
