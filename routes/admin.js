const express = require('express');
const User = require('../models/User');
const Contestant = require('../models/Contestant');
const KeyValue = require('../models/KeyValue');
const { getTaskCatalog, setTaskCatalog } = require('../utils/taskCatalog');
const { sendBulkTelegramMessage } = require('../utils/telegramNotifier');
const { getCurrentContestWeek, CONTEST_WEEK_KEY } = require('../utils/contestWeek');
const { processMiningReminders } = require('../utils/notificationScheduler');
const { getUserLevel } = require('../utils/levelUtil');
const stateEmitter = require('../utils/stateEmitter');

const router = express.Router();
const MINING_REMINDER_LAST_RUN_KEY = 'mining_reminder_last_run';
const WEEKLY_CONTEST_ENABLED_KEY = 'weekly_contest_enabled';

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
        .select('telegramId username points xp streak level isAdmin bronzeTickets silverTickets goldTickets miningStartedAt createdAt'),
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

router.post('/migrations/cleanup-legacy-puzzle', async (_req, res) => {
  try {
    const result = await User.updateMany(
      { 'mysteryBoxes.puzzle': { $exists: true } },
      { $unset: { 'mysteryBoxes.$[].puzzle': '' } }
    );

    return res.json({
      success: true,
      matched: result.matchedCount || 0,
      modified: result.modifiedCount || 0,
      message: 'Legacy mysteryBoxes.puzzle fields removed'
    });
  } catch (err) {
    console.error('Admin cleanup legacy puzzle error:', err);
    return res.status(500).json({ error: 'Failed to cleanup legacy puzzle fields' });
  }
});

module.exports = router;
