const { Address } = require('@ton/core');
const User = require('../models/User');
const CheckIn = require('../models/CheckIn');
const Transaction = require('../models/Transaction');
const MysteryBox = require('../models/MysteryBox');
const Contestant = require('../models/Contestant');
const PendingTaskVerification = require('../models/PendingTaskVerification');
const CompletedTask = require('../models/CompletedTask');
const DailyTaskCompletion = require('../models/DailyTaskCompletion');
const { getTaskCatalog } = require('./taskCatalog');
const { getCurrentContestWeek } = require('./contestWeek');
const { getUserLevel, getNextLevelThreshold } = require('./levelUtil');
const {
  DAILY_CHECKIN_REWARD,
  applyVerifiedDailyCheckIn,
  getCheckInDayKey
} = require('./dailyCheckIn');
const stateEmitter = require('./stateEmitter');

const VERIFY_DELAY_MS = 24 * 60 * 60 * 1000;
const GAME_PASS_DURATION_MS = 24 * 60 * 60 * 1000;
const WEEKLY_REQUIRED_GOLD_TICKETS = Math.max(1, Number(process.env.WEEKLY_DROP_GOLD_TICKETS || 10));
const RECOVERY_TX_LIMIT = 50;
const LOCK_STALE_MS = 3 * 60 * 1000;
const BOX_ORDER = ['bronze', 'silver', 'gold'];

const inFlightRecovery = new Map();

function normalizeMainnetWallet(rawWallet) {
  const value = String(rawWallet || '').trim();
  if (!value) return null;
  try {
    const parsed = Address.parseFriendly(value);
    if (parsed?.isTestOnly) return null;
    return parsed.address.toString({ bounceable: false, testOnly: false });
  } catch (_) {
    try {
      return Address.parse(value).toString({ bounceable: false, testOnly: false });
    } catch {
      return null;
    }
  }
}

function getDayRangeUtc(date = new Date()) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function emitUserUpdated(user) {
  if (!user) return;
  stateEmitter.emit('user:updated', {
    telegramId: user.telegramId,
    points: user.points || 0,
    xp: user.xp || 0,
    level: user.level,
    nextLevelAt: getNextLevelThreshold(user.points || 0),
    bronzeTickets: user.bronzeTickets || 0,
    silverTickets: user.silverTickets || 0,
    goldTickets: user.goldTickets || 0,
    streak: user.streak || 0,
    miningStartedAt: user.miningStartedAt,
    lastCheckInAt: user.lastCheckInAt,
    transactionsCount: user.transactionsCount
  });
}

function withUserLock(telegramId, work) {
  const lockKey = String(telegramId);
  const existing = inFlightRecovery.get(lockKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      return await work();
    } finally {
      if (inFlightRecovery.get(lockKey) === promise) {
        inFlightRecovery.delete(lockKey);
      }
    }
  })();

  inFlightRecovery.set(lockKey, promise);
  return promise;
}

function getRecoverableTxQuery(telegramId) {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  return {
    telegramId: Number(telegramId),
    status: 'verified',
    $or: [
      { rewardStatus: { $exists: false } },
      { rewardStatus: { $in: ['pending', 'failed'] } },
      { rewardStatus: 'processing', reconcileLockedAt: { $lte: staleBefore } }
    ]
  };
}

async function hasRecoverableState(telegramId) {
  const now = new Date();
  const [hasPendingTx, hasReadyPendingVerification] = await Promise.all([
    Transaction.exists(getRecoverableTxQuery(telegramId)),
    PendingTaskVerification.exists({
      telegramId: Number(telegramId),
      submittedAt: { $lte: new Date(now.getTime() - VERIFY_DELAY_MS) }
    })
  ]);
  return Boolean(hasPendingTx || hasReadyPendingVerification);
}

async function markTransactionRewardApplied({ telegramId, txRef, meta = null }) {
  const normalizedTxRef = String(txRef || '').trim();
  if (!normalizedTxRef) return;
  await Transaction.updateOne(
    { telegramId: Number(telegramId), txHash: normalizedTxRef },
    {
      $set: {
        rewardStatus: 'applied',
        rewardedAt: new Date(),
        reconcileLockedAt: null,
        lastReconcileError: null,
        rewardMeta: meta || null
      }
    }
  );
}

async function markTransactionRecoveryFailed(txId, errorMessage) {
  await Transaction.updateOne(
    { _id: txId },
    {
      $set: {
        rewardStatus: 'failed',
        reconcileLockedAt: null,
        lastReconcileError: String(errorMessage || 'Recovery failed')
      }
    }
  );
}

async function markTransactionSkipped(txId, reason) {
  await Transaction.updateOne(
    { _id: txId },
    {
      $set: {
        rewardStatus: 'skipped',
        reconcileLockedAt: null,
        lastReconcileError: String(reason || 'Skipped')
      }
    }
  );
}

async function claimTransactionForRecovery(txId) {
  const staleBefore = new Date(Date.now() - LOCK_STALE_MS);
  return Transaction.findOneAndUpdate(
    {
      _id: txId,
      status: 'verified',
      $or: [
        { rewardStatus: { $exists: false } },
        { rewardStatus: { $in: ['pending', 'failed'] } },
        { rewardStatus: 'processing', reconcileLockedAt: { $lte: staleBefore } }
      ]
    },
    {
      $set: {
        rewardStatus: 'processing',
        reconcileLockedAt: new Date(),
        lastReconcileError: null
      },
      $inc: { reconcileAttempts: 1 }
    },
    { new: true }
  ).lean();
}

async function recoverDailyCheckIn(user, tx) {
  const alreadyApplied = await CheckIn.exists({
    telegramId: Number(user.telegramId),
    txHash: tx.txHash
  });
  if (alreadyApplied) {
    return { applied: true, changedUser: false, meta: { kind: 'daily-checkin', mode: 'already-applied' } };
  }

  const applyResult = await applyVerifiedDailyCheckIn(user, tx.txHash, new Date());
  if (applyResult.ok) {
    return { applied: true, changedUser: true, meta: { kind: 'daily-checkin', mode: 'normal' } };
  }

  if (String(applyResult?.error || '').toLowerCase().includes('already checked in')) {
    user.points = (user.points || 0) + DAILY_CHECKIN_REWARD.points;
    user.bronzeTickets = (user.bronzeTickets || 0) + DAILY_CHECKIN_REWARD.bronzeTickets;
    user.xp = (user.xp || 0) + DAILY_CHECKIN_REWARD.xp;
    user.level = getUserLevel(user.points || 0);
    return {
      applied: true,
      changedUser: true,
      meta: { kind: 'daily-checkin', mode: 'compensated', reason: applyResult.error }
    };
  }

  return {
    applied: false,
    reason: applyResult?.error || 'Could not apply daily check-in'
  };
}

async function recoverFlipcardsPass(user, tx) {
  const txRef = String(tx.txHash || '').trim();
  const purchasedAt = tx.createdAt ? new Date(tx.createdAt) : new Date();
  const candidateValidUntil = new Date(purchasedAt.getTime() + GAME_PASS_DURATION_MS);

  const currentPass = user?.gamePass || null;
  const currentTxRef = String(currentPass?.txRef || '').trim();
  const currentValidUntilMs = new Date(currentPass?.validUntil || 0).getTime();
  const candidateValidUntilMs = candidateValidUntil.getTime();

  if (currentTxRef === txRef) {
    return { applied: true, changedUser: false, meta: { kind: 'flipcards-pass', mode: 'already-applied' } };
  }

  if (Number.isFinite(currentValidUntilMs) && currentValidUntilMs >= candidateValidUntilMs) {
    return { applied: true, changedUser: false, meta: { kind: 'flipcards-pass', mode: 'superseded' } };
  }

  const nextPass = {
    validUntil: candidateValidUntil,
    purchasedAt,
    txRef
  };
  user.gamePass = nextPass;
  return { applied: true, changedUser: true, meta: { kind: 'flipcards-pass', mode: 'restored' } };
}

async function recoverMysteryBoxPurchase(user, tx) {
  const txRef = String(tx.txHash || '').trim();
  const existing = await MysteryBox.exists({ transactionId: txRef });
  if (existing) {
    return { applied: true, changedUser: false, meta: { kind: 'mystery-box-purchase', mode: 'already-applied' } };
  }

  const purchaseTime = tx.createdAt ? new Date(tx.createdAt) : new Date();
  const { start, end } = getDayRangeUtc(purchaseTime);
  const countForDay = await MysteryBox.countDocuments({
    telegramId: Number(user.telegramId),
    purchaseTime: { $gte: start, $lt: end }
  });
  const boxType = BOX_ORDER[countForDay % BOX_ORDER.length];

  try {
    await MysteryBox.create({
      telegramId: Number(user.telegramId),
      boxType,
      status: 'purchased',
      purchaseTime,
      transactionId: txRef
    });
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }

  return { applied: true, changedUser: false, meta: { kind: 'mystery-box-purchase', boxType } };
}

async function recoverWeeklyDropEntry(user, tx) {
  const txRef = String(tx.txHash || '').trim();
  const week = String(tx.taskId || await getCurrentContestWeek()).trim();
  const telegramIdString = String(user.telegramId);

  const existing = await Contestant.findOne({
    $or: [
      { entryTxRef: txRef },
      { telegramId: telegramIdString, week }
    ]
  }).lean();
  if (existing) {
    return { applied: true, changedUser: false, meta: { kind: 'weekly-drop-entry', week, mode: 'already-applied' } };
  }

  const maybeUsername = user.username ? String(user.username).trim() : '';
  const username = maybeUsername || null;
  await Contestant.create({
    telegramId: telegramIdString,
    username,
    wallet: normalizeMainnetWallet(user.wallet),
    entryTxRef: txRef,
    week,
    enteredAt: tx.createdAt ? new Date(tx.createdAt) : new Date()
  });

  let deductedGold = 0;
  if ((user.goldTickets || 0) >= WEEKLY_REQUIRED_GOLD_TICKETS) {
    user.goldTickets -= WEEKLY_REQUIRED_GOLD_TICKETS;
    deductedGold = WEEKLY_REQUIRED_GOLD_TICKETS;
  }

  return {
    applied: true,
    changedUser: deductedGold > 0,
    meta: { kind: 'weekly-drop-entry', week, deductedGold }
  };
}

async function recoverVerifiedTransaction(user, tx) {
  const purpose = String(tx.purpose || '').trim();

  if (purpose === 'daily-checkin') {
    return recoverDailyCheckIn(user, tx);
  }
  if (purpose === 'flipcards-pass') {
    return recoverFlipcardsPass(user, tx);
  }
  if (purpose === 'mystery-box-purchase') {
    return recoverMysteryBoxPurchase(user, tx);
  }
  if (purpose === 'weekly-drop-entry') {
    return recoverWeeklyDropEntry(user, tx);
  }

  return { skipped: true, reason: `No recovery handler for purpose "${purpose || 'unknown'}"` };
}

async function buildTaskMap() {
  const catalog = await getTaskCatalog();
  const map = new Map();
  const daily = Array.isArray(catalog?.daily) ? catalog.daily : [];
  const oneTime = Array.isArray(catalog?.oneTime) ? catalog.oneTime : [];

  daily.forEach((task) => map.set(task.id, { task, isDaily: true }));
  oneTime.forEach((task) => map.set(task.id, { task, isDaily: false }));
  return map;
}

async function autoFinalizePendingVerifications(user) {
  const now = Date.now();
  const readyBefore = new Date(now - VERIFY_DELAY_MS);
  const readyRecords = await PendingTaskVerification.find({
    telegramId: Number(user.telegramId),
    submittedAt: { $lte: readyBefore }
  })
    .sort({ submittedAt: 1 })
    .lean();

  if (!readyRecords.length) return { finalizedCount: 0, changedUser: false };

  const taskMap = await buildTaskMap();
  let finalizedCount = 0;
  let changedUser = false;
  const todayDayKey = getCheckInDayKey(new Date());

  for (const record of readyRecords) {
    const taskMeta = taskMap.get(record.taskId);
    if (!taskMeta?.task || taskMeta.task.comingSoon || taskMeta.task.action !== 'verify') {
      await PendingTaskVerification.deleteOne({ _id: record._id });
      continue;
    }

    const completionQuery = taskMeta.isDaily
      ? { telegramId: Number(user.telegramId), taskId: record.taskId, dayKey: todayDayKey }
      : { telegramId: Number(user.telegramId), taskId: record.taskId };

    const alreadyDone = taskMeta.isDaily
      ? await DailyTaskCompletion.exists(completionQuery)
      : await CompletedTask.exists(completionQuery);

    if (!alreadyDone) {
      try {
        if (taskMeta.isDaily) {
          await DailyTaskCompletion.create({
            ...completionQuery,
            completedAt: new Date()
          });
        } else {
          await CompletedTask.create({
            telegramId: Number(user.telegramId),
            taskId: record.taskId,
            completedAt: new Date()
          });
        }
      } catch (err) {
        if (err?.code !== 11000) throw err;
      }

      const rewardPoints = Number(taskMeta.task.reward || 0);
      user.points = (user.points || 0) + rewardPoints;
      user.level = getUserLevel(user.points || 0);
      changedUser = true;
      finalizedCount += 1;
    }

    await PendingTaskVerification.deleteOne({ _id: record._id });
  }

  return { finalizedCount, changedUser };
}

async function reconcileUserStartup(telegramId) {
  const numericTelegramId = Number(telegramId);
  if (!Number.isFinite(numericTelegramId)) {
    return { changed: false, reason: 'invalid-telegram-id' };
  }

  return withUserLock(numericTelegramId, async () => {
    const user = await User.findOne({ telegramId: numericTelegramId });
    if (!user) return { changed: false, reason: 'user-not-found' };

    let changedUser = false;
    let recoveredTxCount = 0;
    let mysteryClaimed = 0;
    let finalizedPendingVerifications = 0;

    const candidates = await Transaction.find(getRecoverableTxQuery(numericTelegramId))
      .sort({ createdAt: 1 })
      .limit(RECOVERY_TX_LIMIT)
      .lean();

    for (const tx of candidates) {
      const claimedTx = await claimTransactionForRecovery(tx._id);
      if (!claimedTx) continue;

      try {
        const result = await recoverVerifiedTransaction(user, claimedTx);
        if (result?.skipped) {
          await markTransactionSkipped(claimedTx._id, result.reason);
          continue;
        }
        if (!result?.applied) {
          await markTransactionRecoveryFailed(claimedTx._id, result?.reason || 'Could not apply reward');
          continue;
        }

        if (result.changedUser) {
          user.level = getUserLevel(user.points || 0);
          await user.save();
          changedUser = true;
        }

        await markTransactionRewardApplied({
          telegramId: numericTelegramId,
          txRef: claimedTx.txHash,
          meta: result.meta || null
        });
        recoveredTxCount += 1;
      } catch (err) {
        await markTransactionRecoveryFailed(claimedTx._id, err?.message || 'Recovery exception');
      }
    }

    const pendingResult = await autoFinalizePendingVerifications(user);

    mysteryClaimed = 0;
    finalizedPendingVerifications = pendingResult.finalizedCount;

    if (pendingResult.changedUser) {
      user.level = getUserLevel(user.points || 0);
      await user.save();
      changedUser = true;
    }

    if (changedUser) {
      emitUserUpdated(user);
    }

    return {
      changed: changedUser,
      recoveredTxCount,
      mysteryClaimed,
      finalizedPendingVerifications
    };
  });
}

module.exports = {
  hasRecoverableState,
  markTransactionRewardApplied,
  reconcileUserStartup
};
