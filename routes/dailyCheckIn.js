// routes/dailyCheckIn.js

function getDayKey(date = new Date()) {
  const d = new Date(date);

  if (d.getHours() === 0 && d.getMinutes() < 3) {
    d.setDate(d.getDate() - 1);
  }

  return d.toISOString().slice(0, 10);
}

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyTransaction } = require('../utils/tonHandler');

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
    const alreadyCheckedIn = user.checkIns?.some((c) => c.dayKey === dayKey);

    if (alreadyCheckedIn) {
      return res.status(400).json({ error: 'Already checked in today' });
    }

    const isValid = await verifyTransaction({
      telegramId,
      txHash,
      requiredUsd: 0.3
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Transaction not verified' });
    }

    user.streak += 1;
    user.xp += 5;
    user.bronzeTickets += 10;
    user.silverTickets += 1;
    user.lastCheckInDate = new Date();

    user.checkIns = user.checkIns || [];
    user.checkIns.push({
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
