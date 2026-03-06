const express = require('express');
const User = require('../models/User');
const Contestant = require('../models/Contestant');
const KeyValue = require('../models/KeyValue');
const { getTaskCatalog, setTaskCatalog } = require('../utils/taskCatalog');
const { sendBulkTelegramMessage } = require('../utils/telegramNotifier');
const { getCurrentContestWeek, CONTEST_WEEK_KEY } = require('../utils/contestWeek');
const { processMiningReminders } = require('../utils/notificationScheduler');

const router = express.Router();
const MINING_REMINDER_LAST_RUN_KEY = 'mining_reminder_last_run';

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

router.get('/stats', async (_req, res) => {
  try {
    const [users, admins, activeMiners, contestants] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isAdmin: true }),
      User.countDocuments({ miningStartedAt: { $ne: null } }),
      Contestant.countDocuments({})
    ]);

    res.json({
      success: true,
      stats: { users, admins, activeMiners, contestants }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to load admin stats' });
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
        .select('telegramId username points xp streak level isAdmin bronzeTickets silverTickets goldTickets createdAt'),
      User.countDocuments(query)
    ]);

    res.json({
      success: true,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
      users: items
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

    const user = await User.findOneAndUpdate(
      { telegramId },
      { $set: updates },
      { new: true, runValidators: true }
    ).select('telegramId username points xp streak level isAdmin bronzeTickets silverTickets goldTickets');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
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
    res.json({ success: true, ...updated });
  } catch (err) {
    console.error('Admin put tasks error:', err);
    res.status(500).json({ error: 'Failed to update tasks' });
  }
});

router.get('/contests/overview', async (req, res) => {
  try {
    const currentWeek = await getCurrentContestWeek();
    const week = String(req.query.week || currentWeek);

    const [totalEntries, latestEntries] = await Promise.all([
      Contestant.countDocuments({ week }),
      Contestant.find({ week })
        .sort({ enteredAt: -1 })
        .limit(50)
        .select('telegramId wallet week enteredAt')
    ]);

    const resultKey = `contest_result_${week}`;
    const resultDoc = await KeyValue.findOne({ key: resultKey }).lean();

    res.json({
      success: true,
      week,
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

    await KeyValue.findOneAndUpdate(
      { key: CONTEST_WEEK_KEY },
      { value: week },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ success: true, week });
  } catch (err) {
    console.error('Admin set week error:', err);
    res.status(500).json({ error: 'Failed to update week' });
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
