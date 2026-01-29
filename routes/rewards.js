const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getUserLevel } = require('../utils/levelUtil');

// Reward Points
router.post('/points', async (req, res) => {
  const { amount } = req.body;

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'Invalid points amount' });
  }

  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.points += amount;

    const newLevel = getUserLevel(user.points);
    if (user.level !== newLevel) {
      user.level = newLevel;
    }

    await user.save();

    res.json({
      success: true,
      points: user.points,
      level: user.level
    });
  } catch (err) {
    console.error('Reward Points Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reward Tickets (tiered)
router.post('/tickets', async (req, res) => {
  const { bronze = 0, silver = 0, gold = 0 } = req.body;

  if ([bronze, silver, gold].some(v => typeof v !== 'number' || v < 0)) {
    return res.status(400).json({ error: 'Invalid ticket values' });
  }

  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.bronzeTickets += bronze;
    user.silverTickets += silver;
    user.goldTickets += gold;

    await user.save();

    res.json({
      success: true,
      bronze: user.bronzeTickets,
      silver: user.silverTickets,
      gold: user.goldTickets
    });
  } catch (err) {
    console.error('Reward Tickets Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
