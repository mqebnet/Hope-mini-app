const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const { getUserLevel } = require('../../utils/levelUtil');
const { verifyTransaction } = require('../../utils/tonHandler');
const { markTransactionRewardApplied } = require('../../utils/transactionRecovery');
const stateEmitter = require('../../utils/stateEmitter');
const { GameEngineError } = require('./GameEngine');

const GAME_PASS_USD = Number(process.env.FLIPCARDS_PASS_USD || 0.55);
const GAME_PASS_DURATION_MS = 24 * 60 * 60 * 1000;
const GAME_PASS_PURPOSE = 'flipcards-pass';

function getStoredGamePass(user) {
  if (!user || typeof user !== 'object') return null;
  return user.gamePass || null;
}

function setStoredGamePass(user, pass) {
  if (!user || typeof user !== 'object') return;
  user.gamePass = pass;
}

function getTelegramId(ctx) {
  const value = ctx?.user?.telegramId ?? ctx?.telegramId ?? null;
  const telegramId = Number(value);
  if (!Number.isFinite(telegramId)) throw new GameEngineError('Unauthorized', 401);
  return telegramId;
}

function normalizeDifficulty(difficulty = 'normal') {
  return ['easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
}

async function getActivePassInfo(user) {
  const now = Date.now();
  const storedPass = getStoredGamePass(user);
  const validUntilMs = new Date(storedPass?.validUntil || 0).getTime();
  if (Number.isFinite(validUntilMs) && validUntilMs > now) {
    return {
      active: true,
      validUntil: new Date(validUntilMs),
      txRef: storedPass?.txRef || null
    };
  }

  const latestPassTx = await Transaction.findOne({
    telegramId: user.telegramId,
    purpose: GAME_PASS_PURPOSE,
    status: 'verified'
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!latestPassTx?.createdAt) {
    return { active: false, validUntil: null, txRef: storedPass?.txRef || null };
  }

  const purchasedAtMs = new Date(latestPassTx.createdAt).getTime();
  if (!Number.isFinite(purchasedAtMs)) {
    return { active: false, validUntil: null, txRef: latestPassTx.txHash || null };
  }

  const inferredValidUntilMs = purchasedAtMs + GAME_PASS_DURATION_MS;
  if (inferredValidUntilMs <= now) {
    return { active: false, validUntil: null, txRef: latestPassTx.txHash || null };
  }

  return {
    active: true,
    validUntil: new Date(inferredValidUntilMs),
    txRef: latestPassTx.txHash || null
  };
}

async function loadUserWithActivePass(telegramId) {
  const user = await User.findOne({ telegramId });
  if (!user) throw new GameEngineError('User not found', 404);

  const passInfo = await getActivePassInfo(user);
  return { user, passInfo };
}

async function purchaseSharedGamePass({ telegramId, txHash, txBoc, sourceGameId = 'flipcards' }) {
  if (!txHash && !txBoc) {
    throw new GameEngineError('Missing transaction proof', 400);
  }

  const { user, passInfo } = await loadUserWithActivePass(telegramId);
  if (passInfo.active) {
    return {
      success: true,
      message: 'Daily game pass already active',
      passValidUntil: passInfo.validUntil,
      passCost: GAME_PASS_USD,
      active: true
    };
  }

  const verification = await verifyTransaction({
    telegramId,
    txHash,
    txBoc,
    purpose: GAME_PASS_PURPOSE,
    requiredUsd: GAME_PASS_USD
  });
  if (!verification.ok) {
    throw new GameEngineError(verification.reason || 'Invalid payment', 400);
  }

  const validUntil = new Date(Date.now() + GAME_PASS_DURATION_MS);
  setStoredGamePass(user, {
    validUntil,
    purchasedAt: new Date(),
    txRef: verification.txRef || null
  });
  await user.save();

  await markTransactionRewardApplied({
    telegramId,
    txRef: verification.txRef || txHash || txBoc,
    meta: {
      kind: 'shared-game-pass',
      source: `games.${sourceGameId}.purchase`
    }
  });

  return {
    success: true,
    message: 'Daily game pass purchased and verified',
    passValidUntil: validUntil,
    passCost: GAME_PASS_USD,
    active: true
  };
}

async function getSharedPassStatus(telegramId) {
  const { passInfo } = await loadUserWithActivePass(telegramId);
  return {
    success: true,
    hasActivePass: passInfo.active,
    passCost: GAME_PASS_USD,
    passValidUntil: passInfo.active ? passInfo.validUntil : null,
    requiresRevalidation: false
  };
}

function calculateSharedReward({
  difficulty = 'normal',
  timeUsedSeconds = 0,
  timeLimitSeconds = 60,
  mistakes = 0,
  perfect = false
}) {
  const tier = normalizeDifficulty(difficulty);
  const basePoints = tier === 'hard' ? 100 : 50;
  const minimumPoints = tier === 'hard' ? 100 : 20;
  const clampedTime = Math.max(1, Math.min(Number(timeUsedSeconds) || 0, Number(timeLimitSeconds) || 60));
  const clampedLimit = Math.max(1, Number(timeLimitSeconds) || 60);
  const speedFactor = 1 + ((clampedLimit - clampedTime) / clampedLimit);
  const consistencyFactor = perfect ? 1.35 : mistakes <= 1 ? 1.15 : 1;

  let bronzeTickets = 0;
  let silverTickets = 0;

  if (tier === 'hard') {
    bronzeTickets = 20;
    silverTickets = 1;
  } else if (tier === 'normal') {
    if (Math.random() < 0.5) bronzeTickets = 5;
    if (Math.random() < 0.3) silverTickets = 1;
  } else if (Math.random() < 0.3) {
    bronzeTickets = 5;
  }

  return {
    points: Math.max(minimumPoints, Math.floor(basePoints * speedFactor * consistencyFactor)),
    xp: 1,
    bronzeTickets,
    silverTickets,
    goldTickets: 0
  };
}

async function applyRewardToUser({ telegramId, reward, suspicious = false }) {
  const user = await User.findOne({ telegramId });
  if (!user) throw new GameEngineError('User not found', 404);

  const appliedReward = {
    points: Number(reward?.points || 0),
    xp: Number(reward?.xp || 0),
    bronzeTickets: Number(reward?.bronzeTickets || 0),
    silverTickets: Number(reward?.silverTickets || 0),
    goldTickets: Number(reward?.goldTickets || 0)
  };

  if (suspicious) {
    appliedReward.points = Math.floor(appliedReward.points * 0.5);
    appliedReward.xp = Math.floor(appliedReward.xp * 0.5);
  }

  user.points = (user.points || 0) + appliedReward.points;
  user.xp = (user.xp || 0) + appliedReward.xp;
  user.bronzeTickets = (user.bronzeTickets || 0) + appliedReward.bronzeTickets;
  user.silverTickets = (user.silverTickets || 0) + appliedReward.silverTickets;
  user.goldTickets = (user.goldTickets || 0) + appliedReward.goldTickets;
  user.level = getUserLevel(user.points || 0);
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

  return { user, appliedReward };
}

module.exports = {
  GAME_PASS_USD,
  GAME_PASS_DURATION_MS,
  GAME_PASS_PURPOSE,
  getTelegramId,
  normalizeDifficulty,
  getActivePassInfo,
  loadUserWithActivePass,
  purchaseSharedGamePass,
  getSharedPassStatus,
  calculateSharedReward,
  applyRewardToUser
};
