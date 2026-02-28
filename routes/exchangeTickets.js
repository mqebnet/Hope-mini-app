// routes/exchangeTickets.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyTonPayment } = require('../utils/tonHandler');

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
    const { fromType, quantity, txHash } = req.body;
    const requirePayment =
      process.env.REQUIRE_EXCHANGE_PAYMENT === 'true' ||
      process.env.NODE_ENV === 'production';

    if (!fromType || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    if (requirePayment) {
      if (!txHash) {
        return res.status(400).json({ error: 'Missing transaction hash' });
      }

      // Verify TON payment (0.1 USDT equivalent in TON)
      const paid = await verifyTonPayment(txHash, 0.1);
      if (!paid) {
        return res.status(400).json({ error: 'Invalid or unverified payment' });
      }
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
