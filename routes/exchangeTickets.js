// routes/exchangeTickets.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const stateEmitter = require('../utils/stateEmitter');

/**
 * POST /api/exchangeTickets
 * Body:
 * {
 *   fromType: "bronze" | "silver",
 *   quantity: Number,   // how many NEW tickets to receive
 *   txHash: String      // TON transaction hash paying 0.1 USDT
 * }
 */
router.post('/', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { fromType, quantity } = req.body;

    if (!fromType || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const conversionRate = 100; // 100 -> 1
    const required = quantity * conversionRate;

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    let update;

    if (fromType === 'bronze') {
      if ((user.bronzeTickets || 0) < required) {
        return res.status(400).json({ error: 'Insufficient Bronze tickets' });
      }
      update = { $inc: { bronzeTickets: -required, silverTickets: quantity } };
    } else if (fromType === 'silver') {
      if ((user.silverTickets || 0) < required) {
        return res.status(400).json({ error: 'Insufficient Silver tickets' });
      }
      update = { $inc: { silverTickets: -required, goldTickets: quantity } };
    } else {
      return res.status(400).json({ error: 'Invalid ticket type' });
    }

    const updatedUser = await User.findOneAndUpdate(
      { telegramId },
      update,
      { new: true }
    );

    stateEmitter.emit('user:updated', {
      telegramId: updatedUser.telegramId,
      points: updatedUser.points,
      xp: updatedUser.xp || 0,
      level: updatedUser.level,
      nextLevelAt: updatedUser.nextLevelAt,
      bronzeTickets: updatedUser.bronzeTickets || 0,
      silverTickets: updatedUser.silverTickets || 0,
      goldTickets: updatedUser.goldTickets || 0,
      streak: updatedUser.streak || 0,
      miningStartedAt: updatedUser.miningStartedAt
    });

    res.json({
      message: 'Ticket exchange successful',
      bronzeTickets: updatedUser.bronzeTickets,
      silverTickets: updatedUser.silverTickets,
      goldTickets: updatedUser.goldTickets
    });
  } catch (err) {
    console.error('Exchange Tickets Error:', err);
    res.status(500).json({ error: 'Ticket exchange failed' });
  }
});

module.exports = router;
