// routes/tasks.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const CompletedTask = require('../models/CompletedTask');
const { verifyTransaction } = require('../utils/tonHandler');
const { getUserLevel } = require('../utils/levelUtil');
const {
  DAILY_CHECKIN_REWARD,
  getCheckInDayKey,
  applyVerifiedDailyCheckIn,
  hasCheckedInDay,
  hasCheckInTx,
  getUserBadges
} = require('../utils/dailyCheckIn');
const { getTaskCatalog } = require('../utils/taskCatalog');

async function findTaskById(taskId) {
  const catalog = await getTaskCatalog();
  const daily = Array.isArray(catalog?.daily) ? catalog.daily : [];
  const oneTime = Array.isArray(catalog?.oneTime) ? catalog.oneTime : [];
  return [...daily, ...oneTime].find((t) => t.id === taskId) || null;
}

/**
 * POST /api/tasks/daily-checkin
 * Body: { txHash }
 */
router.post('/daily-checkin', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { txHash, txBoc } = req.body;

    if (!txHash && !txBoc) {
      return res.status(400).json({ error: 'Missing transaction proof' });
    }

    const verification = await verifyTransaction({
      telegramId,
      txHash,
      txBoc,
      purpose: 'daily-checkin',
      requiredUsd: 0.3
    });

    if (!verification.ok) {
      console.warn('Tasks daily-checkin verification rejected', {
        telegramId,
        reason: verification.reason,
        hasTxHash: Boolean(txHash),
        hasTxBoc: Boolean(txBoc)
      });
      return res.status(400).json({ error: verification.reason || 'Invalid transaction' });
    }

    const today = new Date();

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const dayKey = getCheckInDayKey(today);
    if (await hasCheckedInDay(telegramId, dayKey)) {
      return res.status(400).json({ error: 'Already checked in today' });
    }
    const proofRef = verification.txRef || txHash || txBoc;
    if (await hasCheckInTx(telegramId, proofRef)) {
      return res.status(400).json({ error: 'Transaction already used for check-in' });
    }

    const applyResult = await applyVerifiedDailyCheckIn(user, proofRef, today);
    if (!applyResult.ok) {
      return res.status(applyResult.status).json({ error: applyResult.error });
    }

    await user.save();
    const badges = await getUserBadges(telegramId);

    res.json({
      success: true,
      points: user.points,
      streak: user.streak,
      xp: user.xp,
      bronzeTickets: user.bronzeTickets,
      level: user.level,
      badges,
      reward: DAILY_CHECKIN_REWARD
    });
  } catch (err) {
    console.error('Daily Check-in Error:', err);
    res.status(500).json({ error: 'Daily check-in failed' });
  }
});

/**
 * POST /api/tasks/complete
 * Body: { taskId }
 * For non-TON daily/social tasks that do not require proof
 */
router.post('/complete', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'Missing taskId' });
    }

    const task = await findTaskById(taskId);
    if (!task) return res.status(400).json({ error: 'Unknown task' });
    if (task.action === 'check-in' || task.action === 'verify') {
      return res.status(400).json({ error: 'Use the correct flow for this task type' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const exists = await CompletedTask.exists({ telegramId, taskId });
    if (exists) {
      return res.status(400).json({ error: 'Task already completed' });
    }

    const rewardPoints = Number(task.reward || 0);
    await CompletedTask.create({ telegramId, taskId, completedAt: new Date() });
    user.points = (user.points || 0) + rewardPoints;
    user.level = getUserLevel(user.points);

    await user.save();

    res.json({
      success: true,
      reward: { points: rewardPoints },
      user: {
        points: user.points,
        xp: user.xp || 0,
        level: user.level
      }
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ error: 'Task already completed' });
    }
    console.error('Complete Task Error:', err);
    res.status(500).json({ error: 'Task completion failed' });
  }
});

/**
 * POST /api/tasks/verify-proof
 * Multipart form with: proof (image), taskId
 */
router.post('/verify-proof', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'Missing taskId' });
    }

    const task = await findTaskById(taskId);
    if (!task) return res.status(400).json({ error: 'Unknown task' });
    if (task.action !== 'verify') {
      return res.status(400).json({ error: 'Task does not require proof verification' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const exists = await CompletedTask.exists({ telegramId, taskId });
    if (exists) {
      return res.status(400).json({ error: 'Task already completed' });
    }

    // TODO:
    // - Save image
    // - Send to email: admin@yourdomain.com

    const rewardPoints = Number(task.reward || 0);
    await CompletedTask.create({ telegramId, taskId, completedAt: new Date() });
    user.points = (user.points || 0) + rewardPoints;
    user.level = getUserLevel(user.points);

    await user.save();

    res.json({
      success: true,
      reward: { points: rewardPoints },
      user: {
        points: user.points,
        xp: user.xp || 0,
        level: user.level
      }
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ error: 'Task already completed' });
    }
    console.error('Verify Proof Error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * GET /api/tasks/definitions
 */
router.get('/definitions', (_, res) => {
  getTaskCatalog()
    .then((catalog) => res.json(catalog))
    .catch((err) => {
      console.error('Task definitions error:', err);
      res.status(500).json({ error: 'Failed to load task definitions' });
    });
});

module.exports = router;
