// routes/weeklyDrop.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Contestant = require('../models/Contestant');
const { getUserLevel } = require('../utils/levelUtil');
const { normalizeStreakIfMissed } = require('../utils/dailyCheckIn');

// Step 1: Check eligibility (used by frontend to enable/disable button)
router.get('/eligibility', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const streakChanged = normalizeStreakIfMissed(user, new Date());
    if (streakChanged) await user.save();

    const level = getUserLevel(user.points || 0);
    const eligible =
      level === 'Believer' &&
      user.streak >= 10 &&
      user.goldTickets >= 10;

    res.json({
      eligible,
      level,
      streak: user.streak,
      goldTickets: user.goldTickets
    });
  } catch (err) {
    console.error('Eligibility error:', err);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// Step 2: Confirm entry after wallet payment
router.post('/enter', async (req, res) => {
  try {
    const { boc } = req.body; // Proof from TonConnect
    if (!boc) {
      return res.status(400).json({ error: 'Missing transaction proof' });
    }

    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const streakChanged = normalizeStreakIfMissed(user, new Date());
    if (streakChanged) await user.save();

    const level = getUserLevel(user.points || 0);
    if (level !== 'Believer') {
      return res.status(400).json({ error: 'You must be Believer level' });
    }
    if (user.streak < 10) {
      return res.status(400).json({ error: 'Perfect streak required' });
    }
    if (user.goldTickets < 10) {
      return res.status(400).json({ error: 'Not enough Gold tickets' });
    }

    // TODO: Verify BOC against TON blockchain here
    // For now we trust it as valid

    user.goldTickets -= 10;
    await user.save();

    const currentWeek = process.env.CURRENT_CONTEST_WEEK || 'Week 1';

    await Contestant.create({
      telegramId: user.telegramId,
      wallet: user.wallet,
      week: currentWeek
    });

    res.json({ success: true, message: 'You are in the Weekly Drop!' });
  } catch (error) {
    console.error('Weekly Drop Error:', error);
    res.status(500).json({ error: 'Weekly drop entry failed' });
  }
});

module.exports = router;
