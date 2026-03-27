const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Contestant = require('../models/Contestant');
const KeyValue = require('../models/KeyValue');
const { Address } = require('@ton/core');
const { getUserLevel } = require('../utils/levelUtil');
const { normalizeStreakIfMissed } = require('../utils/dailyCheckIn');
const { getCurrentContestWeek } = require('../utils/contestWeek');
const { verifyTransaction } = require('../utils/tonHandler');

const WEEKLY_CONTEST_ENABLED_KEY = 'weekly_contest_enabled';
const SYSTEM_USERNAME_RE = /^user_\d+$/i;

function toFriendlyWallet(wallet) {
  if (!wallet || typeof wallet !== 'string') return null;
  const value = wallet.trim();
  if (!value) return null;
  try {
    return Address.parse(value).toString({ bounceable: false });
  } catch (_) {
    return value;
  }
}

async function isContestEnabled() {
  const doc = await KeyValue.findOne({ key: WEEKLY_CONTEST_ENABLED_KEY }).lean();
  return doc?.value !== false;
}

router.get('/eligibility', async (req, res) => {
  try {
    if (!(await isContestEnabled())) {
      return res.json({
        eligible: false,
        disabled: true,
        reason: 'Weekly Drop is currently disabled.'
      });
    }

    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const streakChanged = await normalizeStreakIfMissed(user, new Date());
    if (streakChanged) await user.save();

    const level = getUserLevel(user.points || 0);
    const levels = [
      'Believer', 'Challenger', 'Navigator', 'Ascender',
      'Master', 'Grandmaster', 'Legend', 'Eldrin'
    ];
    const isEligibleLevel = levels.includes(level);

    const currentWeek = await getCurrentContestWeek();
    const alreadyEntered = !!(await Contestant.exists({
      telegramId: String(user.telegramId),
      week: currentWeek
    }));

    const eligible =
      isEligibleLevel &&
      user.streak >= 10 &&
      user.goldTickets >= 10 &&
      !!user.wallet &&
      !alreadyEntered;

    res.json({
      eligible,
      level,
      streak: user.streak,
      goldTickets: user.goldTickets,
      hasWallet: !!user.wallet,
      alreadyEntered,
      currentWeek,
      reason: alreadyEntered
        ? `You have already entered ${currentWeek}.`
        : !isEligibleLevel
          ? 'You must reach Believer level or higher.'
          : user.streak < 10
            ? 'You need a 10-day perfect streak.'
            : user.goldTickets < 10
              ? 'You need at least 10 Gold tickets.'
              : !user.wallet
                ? 'Connect a TON wallet to receive prizes.'
                : null
    });
  } catch (err) {
    console.error('Eligibility error:', err);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

router.post('/enter', async (req, res) => {
  try {
    if (!(await isContestEnabled())) {
      return res.status(403).json({ error: 'Weekly Drop is currently disabled.' });
    }

    const { txHash, txBoc } = req.body;
    if (!txHash && !txBoc) {
      return res.status(400).json({ error: 'Missing transaction proof (txHash or txBoc).' });
    }

    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const streakChanged = await normalizeStreakIfMissed(user, new Date());
    if (streakChanged) await user.save();

    const level = getUserLevel(user.points || 0);
    const levels = [
      'Believer', 'Challenger', 'Navigator', 'Ascender',
      'Master', 'Grandmaster', 'Legend', 'Eldrin'
    ];
    if (!levels.includes(level)) {
      return res.status(400).json({ error: 'You must be Believer level or higher.' });
    }
    if (user.streak < 10) {
      return res.status(400).json({ error: 'Perfect 10-day streak required.' });
    }
    if (user.goldTickets < 10) {
      return res.status(400).json({ error: 'Not enough Gold tickets (need 10).' });
    }
    if (!user.wallet) {
      return res.status(400).json({
        error: 'Connect a TON wallet before entering - needed to receive prizes.'
      });
    }

    const currentWeek = await getCurrentContestWeek();
    const alreadyEntered = await Contestant.exists({
      telegramId: String(user.telegramId),
      week: currentWeek
    });
    if (alreadyEntered) {
      return res.status(400).json({
        error: `You have already entered ${currentWeek}.`
      });
    }

    const verification = await verifyTransaction({
      telegramId: user.telegramId,
      txHash,
      txBoc,
      purpose: 'weekly-drop-entry',
      requiredUsd: 0.5
    });

    if (!verification.ok) {
      console.warn('Weekly drop payment rejected', {
        telegramId: user.telegramId,
        reason: verification.reason
      });
      return res.status(400).json({
        error: verification.reason || 'Payment could not be verified on-chain.'
      });
    }

    user.goldTickets -= 10;
    await user.save();

    try {
      const maybeUsername = user.username ? String(user.username).trim() : '';
      const contestUsername = maybeUsername && !SYSTEM_USERNAME_RE.test(maybeUsername)
        ? maybeUsername
        : null;
      await Contestant.create({
        telegramId: String(user.telegramId),
        username: contestUsername,
        wallet: toFriendlyWallet(user.wallet),
        week: currentWeek
      });
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        user.goldTickets += 10;
        await user.save();
        return res.status(400).json({
          error: `You have already entered ${currentWeek}.`
        });
      }
      throw dbErr;
    }

    res.json({
      success: true,
      message: `You are in ${currentWeek}! Good luck!`,
      week: currentWeek,
      wallet: toFriendlyWallet(user.wallet),
      goldTickets: user.goldTickets
    });
  } catch (error) {
    console.error('Weekly Drop Error:', error);
    res.status(500).json({ error: 'Weekly drop entry failed' });
  }
});

module.exports = router;
