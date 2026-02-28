const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyTransaction } = require('../utils/tonHandler');
const {
  DAILY_CHECKIN_REWARD,
  getCheckInDayKey,
  getNextResetAtUtc,
  normalizeStreakIfMissed,
  buildCheckInCalendar,
  applyVerifiedDailyCheckIn
} = require('../utils/dailyCheckIn');

router.get('/status', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const streakChanged = normalizeStreakIfMissed(user, now);
    if (streakChanged) await user.save();

    const todayKey = getCheckInDayKey(now);
    const checkedInToday = (user.checkIns || []).some((c) => c.dayKey === todayKey);

    res.json({
      success: true,
      streak: user.streak || 0,
      checkedInToday,
      dayKey: todayKey,
      resetAtUtc: getNextResetAtUtc(now).toISOString(),
      reward: DAILY_CHECKIN_REWARD,
      calendar: buildCheckInCalendar(user, now)
    });
  } catch (error) {
    console.error('Daily check-in status error:', error);
    res.status(500).json({ error: 'Failed to fetch daily check-in status' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'txHash required' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const now = new Date();
    const todayKey = getCheckInDayKey(now);

    if ((user.checkIns || []).some((c) => c.dayKey === todayKey)) {
      return res.status(400).json({ error: 'Already checked in today' });
    }
    if ((user.checkIns || []).some((c) => c.txHash === txHash)) {
      return res.status(400).json({ error: 'Transaction already used for check-in' });
    }

    const isValid = await verifyTransaction({
      telegramId,
      txHash,
      requiredUsd: 0.3
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Transaction not verified' });
    }

    const applyResult = applyVerifiedDailyCheckIn(user, txHash, now);
    if (!applyResult.ok) {
      return res.status(applyResult.status).json({ error: applyResult.error });
    }

    await user.save();

    res.json({
      success: true,
      streak: user.streak,
      points: user.points,
      xp: user.xp,
      bronzeTickets: user.bronzeTickets,
      level: user.level,
      badges: user.badges || [],
      dayKey: applyResult.dayKey,
      perfectStreakBadgeAwarded: applyResult.perfectStreakBadgeAwarded,
      reward: DAILY_CHECKIN_REWARD,
      calendar: buildCheckInCalendar(user, now)
    });
  } catch (error) {
    console.error('Daily check-in verification error:', error);
    res.status(500).json({ error: 'Daily check-in failed' });
  }
});

module.exports = router;
