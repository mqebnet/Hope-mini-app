const express = require('express');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Contestant = require('../models/Contestant');
const KeyValue = require('../models/KeyValue');
const { Address } = require('@ton/core');
const { getTaskCatalog, setTaskCatalog } = require('../utils/taskCatalog');
const { sendBulkTelegramMessage } = require('../utils/telegramNotifier');
const {
  getCurrentContestWeek,
  getNextWeekLabel,
  setCurrentContestWeek
} = require('../utils/contestWeek');
const { processMiningReminders } = require('../utils/notificationScheduler');
const { getUserLevel } = require('../utils/levelUtil');
const stateEmitter = require('../utils/stateEmitter');

const router = express.Router();
const MINING_REMINDER_LAST_RUN_KEY = 'mining_reminder_last_run';
const WEEKLY_CONTEST_ENABLED_KEY = 'weekly_contest_enabled';
const SYSTEM_USERNAME_RE = /^user_\d+$/i;
const DEFAULT_TX_ANALYTICS_DAYS = 7;
const MAX_TX_ANALYTICS_DAYS = 90;

const TX_PURPOSE_BUCKETS = {
  'daily-checkin': { key: 'dailyCheckInCount', label: 'Daily Check-In' },
  'mystery-box-purchase': { key: 'mysteryBoxPurchaseCount', label: 'Mystery Box Purchase' },
  'flipcards-pass': { key: 'gamePassCount', label: 'Game Pass' },
  'weekly-drop-entry': { key: 'weeklyDropEntryCount', label: 'Weekly Drop Entry' }
};

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

function toDisplayUsername(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized || SYSTEM_USERNAME_RE.test(normalized)) return null;
  return normalized;
}

function sanitizePage(raw, fallback = 1) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function sanitizeLimit(raw, fallback = 20, max = 100) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function sanitizeDays(raw, fallback = DEFAULT_TX_ANALYTICS_DAYS, max = MAX_TX_ANALYTICS_DAYS) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0
  ));
}

function addUtcDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toUtcDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

router.get('/stats', async (_req, res) => {
  try {
    const [users, admins, activeMiners, contestants, contestEnabled] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isAdmin: true }),
      User.countDocuments({ miningStartedAt: { $ne: null } }),
      Contestant.countDocuments({}),
      KeyValue.findOne({ key: WEEKLY_CONTEST_ENABLED_KEY }).lean()
    ]);

    res.json({
      success: true,
      stats: {
        users,
        admins,
        activeMiners,
        contestants,
        weeklyContestEnabled: contestEnabled?.value !== false
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to load admin stats' });
  }
});

router.get('/transactions/analytics', async (req, res) => {
  try {
    const days = sanitizeDays(req.query.days, DEFAULT_TX_ANALYTICS_DAYS, MAX_TX_ANALYTICS_DAYS);
    const endExclusive = addUtcDays(startOfUtcDay(new Date()), 1);
    const startDate = addUtcDays(endExclusive, -days);

    const grouped = await Transaction.aggregate([
      {
        $match: {
          status: 'verified',
          createdAt: { $gte: startDate, $lt: endExclusive }
        }
      },
      {
        $group: {
          _id: {
            day: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: 'UTC'
              }
            },
            purpose: '$purpose'
          },
          count: { $sum: 1 },
          totalUsd: { $sum: { $ifNull: ['$expectedUsd', 0] } }
        }
      },
      { $sort: { '_id.day': 1 } }
    ]);

    const rows = [];
    const rowMap = new Map();
    for (let cursor = new Date(startDate); cursor < endExclusive; cursor = addUtcDays(cursor, 1)) {
      const dayKey = toUtcDayKey(cursor);
      const row = {
        dayKey,
        totalTransactions: 0,
        dailyCheckInCount: 0,
        mysteryBoxPurchaseCount: 0,
        gamePassCount: 0,
        weeklyDropEntryCount: 0,
        otherCount: 0,
        totalUsd: 0
      };
      rows.push(row);
      rowMap.set(dayKey, row);
    }

    for (const item of grouped) {
      const dayKey = item?._id?.day;
      const purpose = String(item?._id?.purpose || '').trim();
      const row = rowMap.get(dayKey);
      if (!row) continue;

      const count = Number(item.count || 0);
      const totalUsd = roundMoney(item.totalUsd);
      row.totalTransactions += count;
      row.totalUsd = roundMoney(row.totalUsd + totalUsd);

      const bucket = TX_PURPOSE_BUCKETS[purpose];
      if (bucket?.key) {
        row[bucket.key] += count;
      } else {
        row.otherCount += count;
      }
    }

    const summary = rows.reduce((acc, row) => {
      acc.totalTransactions += row.totalTransactions;
      acc.totalUsd = roundMoney(acc.totalUsd + row.totalUsd);
      acc.dailyCheckInCount += row.dailyCheckInCount;
      acc.mysteryBoxPurchaseCount += row.mysteryBoxPurchaseCount;
      acc.gamePassCount += row.gamePassCount;
      acc.weeklyDropEntryCount += row.weeklyDropEntryCount;
      acc.otherCount += row.otherCount;
      if (!acc.busiestDay || row.totalTransactions > acc.busiestDay.totalTransactions) {
        acc.busiestDay = {
          dayKey: row.dayKey,
          totalTransactions: row.totalTransactions
        };
      }
      return acc;
    }, {
      totalTransactions: 0,
      totalUsd: 0,
      dailyCheckInCount: 0,
      mysteryBoxPurchaseCount: 0,
      gamePassCount: 0,
      weeklyDropEntryCount: 0,
      otherCount: 0,
      busiestDay: null
    });

    const featureTotals = [
      { key: 'dailyCheckInCount', label: 'Daily Check-In', count: summary.dailyCheckInCount },
      { key: 'mysteryBoxPurchaseCount', label: 'Mystery Box Purchase', count: summary.mysteryBoxPurchaseCount },
      { key: 'gamePassCount', label: 'Game Pass', count: summary.gamePassCount },
      { key: 'weeklyDropEntryCount', label: 'Weekly Drop Entry', count: summary.weeklyDropEntryCount }
    ];
    featureTotals.sort((a, b) => b.count - a.count);
    summary.topFeature = featureTotals[0]?.count
      ? featureTotals[0]
      : { key: null, label: 'No verified transactions yet', count: 0 };
    if (!summary.totalTransactions) {
      summary.busiestDay = null;
    }

    res.json({
      success: true,
      analytics: {
        generatedAt: new Date().toISOString(),
        days,
        startDate: startDate.toISOString(),
        endDateExclusive: endExclusive.toISOString(),
        summary,
        rows
      }
    });
  } catch (err) {
    console.error('Admin transaction analytics error:', err);
    res.status(500).json({ error: 'Failed to load transaction analytics' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const page = sanitizePage(req.query.page, 1);
    const limit = sanitizeLimit(req.query.limit, 20, 100);
    const search = String(req.query.search || '').trim();

    const query = {};
    if (search) {
      const asNumber = Number(search);
      query.$or = [
        ...(Number.isFinite(asNumber) ? [{ telegramId: asNumber }] : []),
        { username: { $regex: search, $options: 'i' } }
      ];
    }

    const [items, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('telegramId username points xp streak level isAdmin bronzeTickets silverTickets goldTickets miningStartedAt createdAt')
        .lean(),
      User.countDocuments(query)
    ]);

    const telegramIds = items
      .map((item) => Number(item.telegramId))
      .filter((id) => Number.isFinite(id));
    const txCountsAgg = telegramIds.length
      ? await Transaction.aggregate([
        { $match: { telegramId: { $in: telegramIds }, status: 'verified' } },
        { $group: { _id: '$telegramId', count: { $sum: 1 } } }
      ])
      : [];
    const txCountMap = new Map(
      txCountsAgg.map((row) => [Number(row._id), Number(row.count || 0)])
    );
    const users = items.map((item) => ({
      ...item,
      transactionsCount: txCountMap.get(Number(item.telegramId)) || 0
    }));

    res.json({
      success: true,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      users
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.patch('/users/:telegramId', async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);
    if (!Number.isFinite(telegramId)) {
      return res.status(400).json({ error: 'Invalid telegramId' });
    }

    const allowed = ['points', 'xp', 'streak', 'level', 'isAdmin', 'bronzeTickets', 'silverTickets', 'goldTickets'];
    const updates = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) {
        updates[key] = req.body[key];
      }
    }

    if (updates.points !== undefined && updates.level === undefined) {
      updates.level = getUserLevel(Number(updates.points));
    }

    const user = await User.findOneAndUpdate(
      { telegramId },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('telegramId username points xp streak level isAdmin bronzeTickets silverTickets goldTickets nextLevelAt miningStartedAt');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    stateEmitter.emit('user:updated', {
      telegramId: user.telegramId,
      points: user.points,
      xp: user.xp,
      level: user.level,
      streak: user.streak,
      nextLevelAt: user.nextLevelAt,
      bronzeTickets: user.bronzeTickets || 0,
      silverTickets: user.silverTickets || 0,
      goldTickets: user.goldTickets || 0,
      miningStartedAt: user.miningStartedAt
    });
    stateEmitter.emit('global:event', {
      type: 'admin_user_updated',
      data: {
        telegramId: user.telegramId,
        by: Number(req.user.telegramId)
      },
      timestamp: Date.now()
    });

    res.json({ success: true, user });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.post('/users/:telegramId/reset', async (req, res) => {
  try {
    const telegramId = Number(req.params.telegramId);
    if (!Number.isFinite(telegramId)) {
      return res.status(400).json({ error: 'Invalid telegramId' });
    }

    const { fields = ['points', 'xp', 'streak', 'bronzeTickets', 'silverTickets', 'goldTickets'] } = req.body;
    const allowed = ['points', 'xp', 'streak', 'bronzeTickets', 'silverTickets', 'goldTickets'];
    const resetFields = fields.filter((f) => allowed.includes(f));

    const updates = {};
    for (const f of resetFields) updates[f] = 0;
    if (resetFields.includes('points')) updates.level = 'Seeker';

    const user = await User.findOneAndUpdate(
      { telegramId },
      { $set: updates },
      { new: true }
    ).select('telegramId username points xp streak level bronzeTickets silverTickets goldTickets miningStartedAt nextLevelAt');

    if (!user) return res.status(404).json({ error: 'User not found' });

    stateEmitter.emit('user:updated', {
      telegramId: user.telegramId,
      points: user.points,
      xp: user.xp,
      level: user.level,
      streak: user.streak,
      nextLevelAt: user.nextLevelAt,
      bronzeTickets: user.bronzeTickets || 0,
      silverTickets: user.silverTickets || 0,
      goldTickets: user.goldTickets || 0,
      miningStartedAt: user.miningStartedAt
    });
    stateEmitter.emit('global:event', {
      type: 'admin_user_updated',
      data: {
        telegramId: user.telegramId,
        by: Number(req.user.telegramId),
        reset: resetFields
      },
      timestamp: Date.now()
    });

    res.json({ success: true, user, reset: resetFields });
  } catch (err) {
    console.error('Admin reset user error:', err);
    res.status(500).json({ error: 'Failed to reset user' });
  }
});

router.get('/tasks', async (_req, res) => {
  try {
    const catalog = await getTaskCatalog();
    res.json({ success: true, ...catalog });
  } catch (err) {
    console.error('Admin get tasks error:', err);
    res.status(500).json({ error: 'Failed to load tasks' });
  }
});

router.put('/tasks', async (req, res) => {
  try {
    const updated = await setTaskCatalog({
      daily: req.body?.daily,
      oneTime: req.body?.oneTime
    });
    stateEmitter.emit('global:event', {
      type: 'tasks_updated',
      data: updated,
      timestamp: Date.now()
    });
    res.json({ success: true, ...updated });
  } catch (err) {
    console.error('Admin put tasks error:', err);
    res.status(500).json({ error: 'Failed to update tasks' });
  }
});

router.get('/contests/toggle', async (_req, res) => {
  try {
    const doc = await KeyValue.findOne({ key: WEEKLY_CONTEST_ENABLED_KEY }).lean();
    const enabled = doc?.value !== false;
    res.json({ success: true, enabled });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get contest toggle' });
  }
});

router.post('/contests/toggle', async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled);

    await KeyValue.findOneAndUpdate(
      { key: WEEKLY_CONTEST_ENABLED_KEY },
      { value: enabled },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    stateEmitter.emit('global:event', {
      type: 'weekly_contest_toggled',
      data: { enabled },
      timestamp: Date.now()
    });

    res.json({ success: true, enabled });
  } catch (err) {
    console.error('Admin contest toggle error:', err);
    res.status(500).json({ error: 'Failed to update contest toggle' });
  }
});

router.get('/contests/overview', async (req, res) => {
  try {
    const currentWeek = await getCurrentContestWeek();
    const week = String(req.query.week || currentWeek);

    const [totalEntries, latestEntriesRaw] = await Promise.all([
      Contestant.countDocuments({ week }),
      Contestant.find({ week })
        .sort({ enteredAt: -1 })
        .limit(50)
        .select('telegramId username wallet week enteredAt')
        .lean()
    ]);
    const telegramIds = latestEntriesRaw
      .map((entry) => Number(entry.telegramId))
      .filter((id) => Number.isFinite(id));
    const users = telegramIds.length
      ? await User.find({ telegramId: { $in: telegramIds } }).select('telegramId username').lean()
      : [];
    const usernameByTelegramId = new Map(
      users.map((u) => [String(u.telegramId), toDisplayUsername(u.username)])
    );

    const latestEntries = latestEntriesRaw.map((entry) => {
      const username =
        toDisplayUsername(entry.username)
        || usernameByTelegramId.get(String(entry.telegramId))
        || '-';
      return {
        ...entry,
        username,
        wallet: toFriendlyWallet(entry.wallet)
      };
    });

    const resultKey = `contest_result_${week}`;
    const resultDoc = await KeyValue.findOne({ key: resultKey }).lean();

    res.json({
      success: true,
      week,
      currentWeek,
      nextWeek: getNextWeekLabel(currentWeek),
      totalEntries,
      latestEntries,
      result: resultDoc?.value || null
    });
  } catch (err) {
    console.error('Admin contest overview error:', err);
    res.status(500).json({ error: 'Failed to load contest overview' });
  }
});

router.post('/contests/set-week', async (req, res) => {
  try {
    const week = String(req.body?.week || '').trim();
    if (!week) {
      return res.status(400).json({ error: 'week is required' });
    }

    await setCurrentContestWeek(week);

    stateEmitter.emit('global:event', {
      type: 'contest_week_changed',
      data: { week },
      timestamp: Date.now()
    });

    res.json({ success: true, week });
  } catch (err) {
    console.error('Admin set week error:', err);
    res.status(500).json({ error: 'Failed to update week' });
  }
});

router.post('/contests/advance', async (req, res) => {
  try {
    const current = await getCurrentContestWeek();
    const nextWeek = getNextWeekLabel(current);
    await setCurrentContestWeek(nextWeek);

    stateEmitter.emit('global:event', {
      type: 'contest_week_changed',
      data: { week: nextWeek, previousWeek: current },
      timestamp: Date.now()
    });

    res.json({ success: true, previousWeek: current, week: nextWeek });
  } catch (err) {
    console.error('Admin advance week error:', err);
    res.status(500).json({ error: 'Failed to advance week' });
  }
});

router.post('/contests/results', async (req, res) => {
  try {
    const defaultWeek = await getCurrentContestWeek();
    const week = String(req.body?.week || defaultWeek).trim();
    const winnerTelegramIds = Array.isArray(req.body?.winnerTelegramIds)
      ? req.body.winnerTelegramIds.map((v) => Number(v)).filter((v) => Number.isFinite(v))
      : [];
    const publicMessage = String(req.body?.message || 'Weekly contest results are out.');

    if (!winnerTelegramIds.length) {
      return res.status(400).json({ error: 'winnerTelegramIds is required' });
    }

    const resultPayload = {
      week,
      winnerTelegramIds,
      message: publicMessage,
      publishedAt: new Date().toISOString(),
      publishedBy: req.user.telegramId
    };

    await KeyValue.findOneAndUpdate(
      { key: `contest_result_${week}` },
      { value: resultPayload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const winnerText = [
      `Contest result (${week})`,
      'Congratulations. You are one of the winners.',
      publicMessage
    ].join('\n');

    const winnersNotify = await sendBulkTelegramMessage(winnerTelegramIds, winnerText);

    const participants = await Contestant.find({ week }).select('telegramId').lean();
    const participantIds = participants.map((p) => Number(p.telegramId)).filter((v) => Number.isFinite(v));
    const nonWinners = participantIds.filter((id) => !winnerTelegramIds.includes(id));
    const participantText = [
      `Contest result (${week})`,
      'Results are now available in the app.',
      publicMessage
    ].join('\n');
    const participantsNotify = await sendBulkTelegramMessage(nonWinners, participantText);

    stateEmitter.emit('global:event', {
      type: 'contest_results_published',
      data: { week, winnerCount: winnerTelegramIds.length },
      timestamp: Date.now()
    });

    res.json({
      success: true,
      result: resultPayload,
      notifications: {
        winners: winnersNotify.length,
        participants: participantsNotify.length
      }
    });
  } catch (err) {
    console.error('Admin publish contest results error:', err);
    res.status(500).json({ error: 'Failed to publish contest results' });
  }
});

router.post('/broadcast', async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const level = req.body?.level ? String(req.body.level).trim() : null;
    const query = level ? { level } : {};

    const users = await User.find(query).select('telegramId level').lean();
    const telegramIds = users.map((u) => Number(u.telegramId)).filter((id) => Number.isFinite(id));
    const results = await sendBulkTelegramMessage(telegramIds, message);

    const sent = results.filter((r) => r.ok).length;
    stateEmitter.emit('global:event', {
      type: 'admin_broadcast',
      data: {
        message,
        targeted: level || 'ALL',
        total: telegramIds.length,
        sent
      },
      timestamp: Date.now()
    });

    res.json({
      success: true,
      targeted: level || 'ALL',
      total: telegramIds.length,
      sent
    });
  } catch (err) {
    console.error('Admin broadcast error:', err);
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

router.post('/notifications/mining-reminders/run', async (_req, res) => {
  try {
    const result = await processMiningReminders();
    const payload = {
      ...result,
      runAt: new Date().toISOString(),
      requestedBy: Number(_req.user.telegramId)
    };

    await KeyValue.findOneAndUpdate(
      { key: MINING_REMINDER_LAST_RUN_KEY },
      { value: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    stateEmitter.emit('global:event', {
      type: 'mining_reminders_run',
      data: {
        ...payload,
        targetTelegramId: Number(_req.user.telegramId)
      },
      timestamp: Date.now()
    });

    res.json({ success: true, result: payload });
  } catch (err) {
    console.error('Admin mining reminder run error:', err);
    res.status(500).json({ error: 'Failed to run mining reminders' });
  }
});

router.get('/notifications/mining-reminders/last-run', async (_req, res) => {
  try {
    const doc = await KeyValue.findOne({ key: MINING_REMINDER_LAST_RUN_KEY }).lean();
    res.json({
      success: true,
      lastRun: doc?.value || null
    });
  } catch (err) {
    console.error('Admin mining reminder last-run error:', err);
    res.status(500).json({ error: 'Failed to load mining reminder run metadata' });
  }
});

module.exports = router;
