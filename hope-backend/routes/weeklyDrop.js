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
const { markTransactionRewardApplied } = require('../utils/transactionRecovery');

const WEEKLY_CONTEST_ENABLED_KEY = 'weekly_contest_enabled';
const SYSTEM_USERNAME_RE = /^user_\d+$/i;
const WEEKLY_REQUIRED_GOLD_TICKETS = Math.max(1, Number(process.env.WEEKLY_DROP_GOLD_TICKETS || 10));
const WEEKLY_ENTRY_USD = Math.max(0.01, Number(process.env.WEEKLY_DROP_ENTRY_USD || 0.5));

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
        reason: 'Weekly Drop is currently disabled.',
        reasonKey: 'weekly.disabled_status',
        requiredGoldTickets: WEEKLY_REQUIRED_GOLD_TICKETS,
        entryUsd: WEEKLY_ENTRY_USD
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
      user.goldTickets >= WEEKLY_REQUIRED_GOLD_TICKETS &&
      !!user.wallet &&
      !alreadyEntered;

    let reason = null;
    let reasonKey = null;
    let reasonParams = null;

    if (alreadyEntered) {
      reason = `You have already entered ${currentWeek}.`;
      reasonKey = 'weekly.already_entered';
      reasonParams = { week: currentWeek };
    } else if (!isEligibleLevel) {
      reason = 'You must reach Believer level or higher.';
      reasonKey = 'weekly.lock_require_level';
    } else if (user.streak < 10) {
      reason = 'You need a 10-day perfect streak.';
      reasonKey = 'weekly.lock_require_streak';
      reasonParams = { current: Number(user.streak || 0) };
    } else if (user.goldTickets < WEEKLY_REQUIRED_GOLD_TICKETS) {
      reason = `You need at least ${WEEKLY_REQUIRED_GOLD_TICKETS} Gold tickets.`;
      reasonKey = 'weekly.lock_require_gold';
      reasonParams = {
        current: Number(user.goldTickets || 0),
        requiredGoldTickets: WEEKLY_REQUIRED_GOLD_TICKETS
      };
    } else if (!user.wallet) {
      reason = 'Connect a TON wallet to receive prizes.';
      reasonKey = 'weekly.lock_require_wallet';
    }

    res.json({
      eligible,
      level,
      streak: user.streak,
      goldTickets: user.goldTickets,
      hasWallet: !!user.wallet,
      alreadyEntered,
      currentWeek,
      requiredGoldTickets: WEEKLY_REQUIRED_GOLD_TICKETS,
      entryUsd: WEEKLY_ENTRY_USD,
      reason,
      reasonKey,
      reasonParams
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
    if (user.goldTickets < WEEKLY_REQUIRED_GOLD_TICKETS) {
      return res.status(400).json({ error: `Not enough Gold tickets (need ${WEEKLY_REQUIRED_GOLD_TICKETS}).` });
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
      taskId: currentWeek,
      requiredUsd: WEEKLY_ENTRY_USD
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

    user.goldTickets -= WEEKLY_REQUIRED_GOLD_TICKETS;
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
        entryTxRef: verification.txRef || txHash || txBoc || null,
        week: currentWeek
      });
    } catch (dbErr) {
      if (dbErr.code === 11000) {
        user.goldTickets += WEEKLY_REQUIRED_GOLD_TICKETS;
        await user.save();
        return res.status(400).json({
          error: `You have already entered ${currentWeek}.`
        });
      }
      throw dbErr;
    }

    await markTransactionRewardApplied({
      telegramId: user.telegramId,
      txRef: verification.txRef || txHash || txBoc,
      meta: { kind: 'weekly-drop-entry', week: currentWeek, source: 'weeklyDrop.enter' }
    });

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
