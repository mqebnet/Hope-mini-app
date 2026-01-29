// routes/dailyCheckIn.js

function getDayKey(date = new Date()) {
  const d = new Date(date);

  // Your reset rule: 00:03 AM
  if (d.getHours() === 0 && d.getMinutes() < 3) {
    d.setDate(d.getDate() - 1);
  }

  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyTransaction } = require('../utils/tonHandler');

/**
 * POST /api/dailyCheckIn/verify
 * Body:
 * {
 *   txHash: string
 * }
 *
 * Called AFTER payment.
 * Applies streak + rewards ONLY if tx is valid.
 */
router.post('/verify', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'txHash required' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

const dayKey = getDayKey();

const alreadyCheckedIn = user.checkIns?.some(
  c => c.dayKey === dayKey
);

if (alreadyCheckedIn) {
  return res.status(400).json({
    error: 'Already checked in today'
  });
  
}

    // ⛔ Prevent double check-in same day
    const now = new Date();
    const resetTime = new Date(now);
    resetTime.setHours(0, 3, 0, 0); // 00:03 reset

    if (user.lastCheckInDate && user.lastCheckInDate >= resetTime) {
      return res.status(400).json({ error: 'Already checked in today' });
    }

    // 🔐 Verify TON transaction
    const isValid = await verifyTransaction({
      userId: telegramId,
      txHash,
      requiredUsd: 0.3
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Transaction not verified' });
    }

    // ✅ Apply rewards ONLY NOW
    user.streak += 1;
    user.xp += 5;
    user.bronzeTickets += 10;
    user.silverTickets += 1;
    user.lastCheckInDate = now;

    user.checkIns = user.checkIns || [];
    user.checkIns.push({
      date: now,
      txHash,
      verified: true,
      dayKey,
  createdAt: new Date()
    });

    await user.save();

    res.json({
      success: true,
      streak: user.streak,
      xp: user.xp,
      bronzeTickets: user.bronzeTickets,
      silverTickets: user.silverTickets
    });

  } catch (error) {
    console.error('Daily check-in verification error:', error);
    res.status(500).json({ error: 'Daily check-in failed' });
  }
});

module.exports = router;
