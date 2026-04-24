const express = require('express');
const router = express.Router();
const User = require('../models/User');
const CompletedTask = require('../models/CompletedTask');
const DailyTaskCompletion = require('../models/DailyTaskCompletion');
const PendingTaskVerification = require('../models/PendingTaskVerification');
const { verifyTransaction } = require('../utils/tonHandler');
const { markTransactionRewardApplied } = require('../utils/transactionRecovery');
const { getUserLevel, getNextLevelThreshold } = require('../utils/levelUtil');
const stateEmitter = require('../utils/stateEmitter');
const {
  DAILY_CHECKIN_REWARD,
  getCheckInDayKey,
  applyVerifiedDailyCheckIn,
  hasCheckedInDay,
  hasCheckInTx,
  getUserBadges
} = require('../utils/dailyCheckIn');
const { getTaskCatalog } = require('../utils/taskCatalog');

const VERIFY_DELAY_MS = 24 * 60 * 60 * 1000;

function buildUserSnapshot(user) {
  return {
    telegramId: user.telegramId,
    username: user.username,
    points: user.points || 0,
    xp: user.xp || 0,
    level: user.level || 'Seeker',
    nextLevelAt: getNextLevelThreshold(user.points || 0),
    bronzeTickets: user.bronzeTickets || 0,
    silverTickets: user.silverTickets || 0,
    goldTickets: user.goldTickets || 0,
    streak: user.streak || 0
  };
}

async function findTaskById(taskId) {
  const catalog = await getTaskCatalog();
  const daily = Array.isArray(catalog?.daily) ? catalog.daily : [];
  const oneTime = Array.isArray(catalog?.oneTime) ? catalog.oneTime : [];
  const dailyTask = daily.find((t) => t.id === taskId);
  if (dailyTask) {
    return { task: dailyTask, isDaily: true };
  }
  const oneTimeTask = oneTime.find((t) => t.id === taskId);
  if (oneTimeTask) {
    return { task: oneTimeTask, isDaily: false };
  }
  return null;
}

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
    await markTransactionRewardApplied({
      telegramId: user.telegramId,
      txRef: proofRef,
      meta: { kind: 'daily-checkin', source: 'tasks.daily-checkin' }
    });
    stateEmitter.emit('user:updated', {
      telegramId: user.telegramId,
      points: user.points,
      xp: user.xp || 0,
      level: user.level,
      nextLevelAt: user.nextLevelAt,
      bronzeTickets: user.bronzeTickets || 0,
      silverTickets: user.silverTickets || 0,
      goldTickets: user.goldTickets || 0,
      streak: user.streak || 0,
      miningStartedAt: user.miningStartedAt,
      lastCheckInAt: user.lastCheckInAt,
      transactionsCount: user.transactionsCount
    });
    const badges = await getUserBadges(telegramId);

    res.json({
      success: true,
      points: user.points,
      streak: user.streak,
      xp: user.xp,
      bronzeTickets: user.bronzeTickets,
      silverTickets: user.silverTickets || 0,
      goldTickets: user.goldTickets || 0,
      level: user.level,
      badges,
      reward: DAILY_CHECKIN_REWARD,
      user: buildUserSnapshot(user)
    });
  } catch (err) {
    console.error('Daily Check-in Error:', err);
    res.status(500).json({ error: 'Daily check-in failed' });
  }
});

router.post('/complete', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'Missing taskId' });
    }

    const taskMeta = await findTaskById(taskId);
    if (!taskMeta) return res.status(400).json({ error: 'Unknown task' });
    const { task, isDaily } = taskMeta;
    if (task.comingSoon) {
      return res.status(400).json({ error: 'Task is not available yet' });
    }
    if (task.action === 'check-in' || task.action === 'verify') {
      return res.status(400).json({ error: 'Use the correct flow for this task type' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const now = new Date();
    const completionQuery = isDaily
      ? { telegramId, taskId, dayKey: getCheckInDayKey(now) }
      : { telegramId, taskId };
    const exists = isDaily
      ? await DailyTaskCompletion.exists(completionQuery)
      : await CompletedTask.exists(completionQuery);
    if (exists) {
      return res.status(400).json({ error: isDaily ? 'Task already completed today' : 'Task already completed' });
    }

    const rewardPoints = Number(task.reward || 0);
    if (isDaily) {
      await DailyTaskCompletion.create({
        telegramId,
        taskId,
        dayKey: completionQuery.dayKey,
        completedAt: now
      });
    } else {
      await CompletedTask.create({ telegramId, taskId, completedAt: now });
    }
    user.points = (user.points || 0) + rewardPoints;
    user.level = getUserLevel(user.points);

    await user.save();
    stateEmitter.emit('user:updated', {
      telegramId: user.telegramId,
      points: user.points,
      xp: user.xp || 0,
      level: user.level,
      nextLevelAt: user.nextLevelAt,
      bronzeTickets: user.bronzeTickets || 0,
      silverTickets: user.silverTickets || 0,
      goldTickets: user.goldTickets || 0,
      streak: user.streak || 0,
      miningStartedAt: user.miningStartedAt,
      lastCheckInAt: user.lastCheckInAt,
      transactionsCount: user.transactionsCount
    });

    res.json({
      success: true,
      reward: { points: rewardPoints },
      user: buildUserSnapshot(user)
    });
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(400).json({ error: 'Task already completed' });
    }
    console.error('Complete Task Error:', err);
    res.status(500).json({ error: 'Task completion failed' });
  }
});

router.post('/start-verify', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'Missing taskId' });
    }

    const taskMeta = await findTaskById(taskId);
    if (!taskMeta || taskMeta.task.action !== 'verify') {
      return res.status(400).json({ error: 'Invalid task' });
    }
    const { task, isDaily } = taskMeta;
    if (task.comingSoon || !task.url) {
      return res.status(400).json({ error: 'Task is not available yet' });
    }
    const completionQuery = isDaily
      ? { telegramId, taskId, dayKey: getCheckInDayKey(new Date()) }
      : { telegramId, taskId };

    const alreadyDone = isDaily
      ? await DailyTaskCompletion.exists(completionQuery)
      : await CompletedTask.exists(completionQuery);
    if (alreadyDone) {
      return res.status(400).json({ error: isDaily ? 'Task already completed today' : 'Task already completed' });
    }

    const existing = await PendingTaskVerification.findOne({ telegramId, taskId }).lean();
    if (existing) {
      const elapsed = Date.now() - new Date(existing.submittedAt).getTime();
      const readyAt = new Date(existing.submittedAt).getTime() + VERIFY_DELAY_MS;
      return res.json({
        success: true,
        pending: true,
        readyAt,
        readyNow: elapsed >= VERIFY_DELAY_MS
      });
    }

    const now = new Date();
    await PendingTaskVerification.create({
      telegramId,
      taskId,
      submittedAt: now
    });

    const readyAt = now.getTime() + VERIFY_DELAY_MS;

    res.json({
      success: true,
      pending: true,
      readyAt,
      readyNow: false
    });
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await PendingTaskVerification.findOne({
        telegramId: req.user.telegramId,
        taskId: req.body?.taskId
      }).lean();
      if (existing) {
        const readyAt = new Date(existing.submittedAt).getTime() + VERIFY_DELAY_MS;
        return res.json({
          success: true,
          pending: true,
          readyAt,
          readyNow: Date.now() >= readyAt
        });
      }
    }
    console.error('Start verify error:', err);
    res.status(500).json({ error: 'Failed to start verification' });
  }
});

router.post('/claim-verify', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'Missing taskId' });
    }

    const taskMeta = await findTaskById(taskId);
    if (!taskMeta || taskMeta.task.action !== 'verify') {
      return res.status(400).json({ error: 'Invalid task' });
    }
    const { task, isDaily } = taskMeta;
    if (task.comingSoon || !task.url) {
      return res.status(400).json({ error: 'Task is not available yet' });
    }
    const completionQuery = isDaily
      ? { telegramId, taskId, dayKey: getCheckInDayKey(new Date()) }
      : { telegramId, taskId };

    const alreadyDone = isDaily
      ? await DailyTaskCompletion.exists(completionQuery)
      : await CompletedTask.exists(completionQuery);
    if (alreadyDone) {
      return res.status(400).json({ error: isDaily ? 'Task already completed today' : 'Task already completed' });
    }

    const pending = await PendingTaskVerification.findOne({ telegramId, taskId }).lean();
    if (!pending) {
      return res.status(400).json({
        error: 'Task verification not started. Click Go first.'
      });
    }

    const elapsed = Date.now() - new Date(pending.submittedAt).getTime();
    if (elapsed < VERIFY_DELAY_MS) {
      const remainingMs = VERIFY_DELAY_MS - elapsed;
      const remainingHrs = Math.ceil(remainingMs / (1000 * 60 * 60));
      return res.status(400).json({
        error: `Verification still in progress. Ready in ~${remainingHrs} hour${remainingHrs === 1 ? '' : 's'}.`,
        readyAt: new Date(pending.submittedAt).getTime() + VERIFY_DELAY_MS
      });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const rewardPoints = Number(task.reward || 0);

    try {
      if (isDaily) {
        await DailyTaskCompletion.create({
          telegramId,
          taskId,
          dayKey: completionQuery.dayKey,
          completedAt: new Date()
        });
      } else {
        await CompletedTask.create({ telegramId, taskId, completedAt: new Date() });
      }
    } catch (dbErr) {
      if (dbErr?.code === 11000) {
        return res.status(400).json({ error: isDaily ? 'Task already completed today' : 'Task already completed' });
      }
      throw dbErr;
    }

    await PendingTaskVerification.deleteOne({ telegramId, taskId });

    user.points = (user.points || 0) + rewardPoints;
    user.level = getUserLevel(user.points);
    await user.save();

    stateEmitter.emit('user:updated', {
      telegramId: user.telegramId,
      points: user.points,
      xp: user.xp || 0,
      level: user.level,
      nextLevelAt: user.nextLevelAt,
      bronzeTickets: user.bronzeTickets || 0,
      silverTickets: user.silverTickets || 0,
      goldTickets: user.goldTickets || 0,
      streak: user.streak || 0,
      miningStartedAt: user.miningStartedAt
    });

    res.json({
      success: true,
      reward: { points: rewardPoints },
      user: buildUserSnapshot(user)
    });
  } catch (err) {
    console.error('Claim verify error:', err);
    res.status(500).json({ error: 'Claim failed' });
  }
});

router.get('/pending-verifications', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const records = await PendingTaskVerification.find({ telegramId }).lean();

    const result = records.map((r) => ({
      taskId: r.taskId,
      readyAt: new Date(r.submittedAt).getTime() + VERIFY_DELAY_MS,
      readyNow: Date.now() >= new Date(r.submittedAt).getTime() + VERIFY_DELAY_MS
    }));

    res.json({ success: true, pending: result });
  } catch (err) {
    console.error('Pending verifications error:', err);
    res.status(500).json({ error: 'Failed to load pending verifications' });
  }
});

router.get('/definitions', (_, res) => {
  getTaskCatalog()
    .then((catalog) => res.json(catalog))
    .catch((err) => {
      console.error('Task definitions error:', err);
      res.status(500).json({ error: 'Failed to load task definitions' });
    });
});

module.exports = router;
