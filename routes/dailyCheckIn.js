const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyTransaction } = require('../utils/tonHandler');
const stateEmitter = require('../utils/stateEmitter');
const {
  DAILY_CHECKIN_REWARD,
  getCheckInDayKey,
  getNextResetAtUtc,
  normalizeStreakIfMissed,
  buildCheckInCalendar,
  applyVerifiedDailyCheckIn,
  hasCheckedInDay,
  hasCheckInTx,
  getUserCheckIns,
  getUserBadges
} = require('../utils/dailyCheckIn');

router.get('/status', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const streakChanged = normalizeStreakIfMissed(user, now);
    if (streakChanged) await user.save();

    const todayKey = getCheckInDayKey(now);
    const checkIns = await getUserCheckIns(user.telegramId, 120);
    const checkedInToday = await hasCheckedInDay(user.telegramId, todayKey);

    res.json({
      success: true,
      streak: user.streak || 0,
      checkedInToday,
      dayKey: todayKey,
      resetAtUtc: getNextResetAtUtc(now).toISOString(),
      reward: DAILY_CHECKIN_REWARD,
      calendar: buildCheckInCalendar(checkIns, now)
    });
  } catch (error) {
    console.error('Daily check-in status error:', error);
    res.status(500).json({ error: 'Failed to fetch daily check-in status' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { txHash, txBoc } = req.body;

    if (!txHash && !txBoc) {
      return res.status(400).json({ error: 'txHash or txBoc required' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const now = new Date();
    const todayKey = getCheckInDayKey(now);

    if (await hasCheckedInDay(telegramId, todayKey)) {
      return res.status(400).json({ error: 'Already checked in today' });
    }
    if (txHash && await hasCheckInTx(telegramId, txHash)) {
      return res.status(400).json({ error: 'Transaction already used for check-in' });
    }

    const verification = await verifyTransaction({
      telegramId,
      txHash,
      txBoc,
      purpose: 'daily-checkin',
      requiredUsd: 0.3
    });

    if (!verification.ok) {
      console.warn('Daily check-in verification rejected', {
        telegramId,
        reason: verification.reason,
        hasTxHash: Boolean(txHash),
        hasTxBoc: Boolean(txBoc)
      });
      return res.status(400).json({ error: verification.reason || 'Transaction not verified' });
    }

    const proofRef = verification.txRef || txHash || txBoc;
    if (await hasCheckInTx(telegramId, proofRef)) {
      return res.status(400).json({ error: 'Transaction already used for check-in' });
    }

    const applyResult = await applyVerifiedDailyCheckIn(user, proofRef, now);
    if (!applyResult.ok) {
      return res.status(applyResult.status).json({ error: applyResult.error });
    }

    await user.save();

    // Emit real-time update via WebSocket
    stateEmitter.emit('user:updated', {
      telegramId: user.telegramId,
      points: user.points,
      xp: user.xp,
      level: user.level,
      nextLevelAt: user.nextLevelAt,
      bronzeTickets: user.bronzeTickets,
      silverTickets: user.silverTickets,
      goldTickets: user.goldTickets,
      streak: user.streak,
      miningStartedAt: user.miningStartedAt,
      lastCheckInAt: user.lastCheckInAt,
      transactionsCount: user.transactionsCount
    });

    const [badges, checkIns] = await Promise.all([
      getUserBadges(user.telegramId),
      getUserCheckIns(user.telegramId, 120)
    ]);

    res.json({
      success: true,
      streak: user.streak,
      points: user.points,
      xp: user.xp,
      bronzeTickets: user.bronzeTickets,
      level: user.level,
      badges,
      dayKey: applyResult.dayKey,
      perfectStreakBadgeAwarded: applyResult.perfectStreakBadgeAwarded,
      reward: DAILY_CHECKIN_REWARD,
      calendar: buildCheckInCalendar(checkIns, now)
    });
  } catch (error) {
    console.error('Daily check-in verification error:', error);
    res.status(500).json({ error: 'Daily check-in failed' });
  }
});

module.exports = router;
