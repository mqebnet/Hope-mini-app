const GameSession = require('../../../models/GameSession');
const User = require('../../../models/User');
const Transaction = require('../../../models/Transaction');
const { getUserLevel } = require('../../../utils/levelUtil');
const { verifyTransaction } = require('../../../utils/tonHandler');
const stateEmitter = require('../../../utils/stateEmitter');
const { GameEngineError } = require('../GameEngine');

const FLIPCARDS_PASS_USD = Number(process.env.FLIPCARDS_PASS_USD || 0.55);
const FLIPCARDS_PASS_DURATION_MS = 24 * 60 * 60 * 1000;

function getTelegramId(ctx) {
  const value = ctx?.user?.telegramId ?? ctx?.telegramId ?? null;
  const telegramId = Number(value);
  if (!Number.isFinite(telegramId)) throw new GameEngineError('Unauthorized', 401);
  return telegramId;
}

function toClientCards(cards = []) {
  return cards.map((card) => ({
    id: card.id,
    symbol: card.symbol,
    revealed: card.revealed
  }));
}

async function getActivePassInfo(user) {
  const now = Date.now();
  const validUntilMs = new Date(user?.flipcardsPass?.validUntil || 0).getTime();
  if (Number.isFinite(validUntilMs) && validUntilMs > now) {
    return {
      active: true,
      validUntil: new Date(validUntilMs),
      txRef: user?.flipcardsPass?.txRef || null
    };
  }

  // Backward compatibility for users with old data shape:
  // infer active pass from recent verified flipcards-pass transaction.
  const latestPassTx = await Transaction.findOne({
    telegramId: user.telegramId,
    purpose: 'flipcards-pass',
    status: 'verified'
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!latestPassTx?.createdAt) {
    return { active: false, validUntil: null, txRef: user?.flipcardsPass?.txRef || null };
  }

  const purchasedAtMs = new Date(latestPassTx.createdAt).getTime();
  if (!Number.isFinite(purchasedAtMs)) {
    return { active: false, validUntil: null, txRef: latestPassTx.txHash || null };
  }
  const inferredValidUntilMs = purchasedAtMs + FLIPCARDS_PASS_DURATION_MS;
  if (inferredValidUntilMs <= now) {
    return { active: false, validUntil: null, txRef: latestPassTx.txHash || null };
  }

  return {
    active: true,
    validUntil: new Date(inferredValidUntilMs),
    txRef: latestPassTx.txHash || null
  };
}

module.exports = {
  id: 'flipcards',
  version: '1.0.0',
  meta: {
    name: 'Flip Cards',
    description: `Match triplets to win rewards. Pass required: $${FLIPCARDS_PASS_USD.toFixed(2)}/24h`,
    icon: '🎴',
    type: 'skill',
    category: 'games',
    entryFeeUsd: FLIPCARDS_PASS_USD,
    dailyPassRequired: true
  },

  async start(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const user = await User.findOne({ telegramId });
    if (!user) throw new GameEngineError('User not found', 404);

    const passInfo = await getActivePassInfo(user);
    if (!passInfo.active) {
      throw new GameEngineError(`Daily pass required. Purchase for $${FLIPCARDS_PASS_USD.toFixed(2)} to play for 24 hours.`, 402);
    }

    const { difficulty = 'normal' } = payload;
    const tripletMap = { easy: 3, normal: 4, hard: 5 };
    const numTriplets = tripletMap[difficulty] || 4;
    const gameData = GameSession.generateGame(numTriplets);
    const timeLimitMap = { easy: 60, normal: 45, hard: 40 };
    const timeLimit = timeLimitMap[difficulty] || 45;

    const session = new GameSession({
      telegramId,
      gameType: 'flipcards',
      cards: gameData.cards,
      cardStateChecksum: gameData.checksum,
      totalTriplets: gameData.totalTriplets,
      startedAt: new Date(),
      timeLimitSeconds: timeLimit
    });
    await session.save();

    return {
      success: true,
      gameSessionId: session._id.toString(),
      cards: toClientCards(session.cards),
      totalPairs: session.totalTriplets * 3,
      timeLimit: session.timeLimitSeconds,
      difficulty
    };
  },

  async move(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const { gameSessionId, cardIds, clientDuration } = payload;

    if (!gameSessionId || !Array.isArray(cardIds)) {
      throw new GameEngineError('Missing required fields', 400);
    }

    const session = await GameSession.findById(gameSessionId);
    if (!session || session.telegramId !== telegramId) {
      throw new GameEngineError('Game session not found', 404);
    }
    if (session.status !== 'active') {
      throw new GameEngineError('Game is no longer active', 400);
    }

    const validation = session.validateMove(cardIds);
    if (!validation.valid) {
      throw new GameEngineError(validation.reason, 400);
    }

    session.moves.push({
      cardIds,
      timestamp: new Date(),
      duration: clientDuration
    });
    session.matchAttempts += 1;

    const matchResult = session.checkTripletMatch(cardIds);
    if (matchResult.matched && !session.matchedTriplets.includes(matchResult.tripletId)) {
      session.matchedTriplets.push(matchResult.tripletId);
      session.correctMatches += 1;
      cardIds.forEach((cardId) => {
        const card = session.cards.find((c) => c.id === cardId);
        if (card) card.revealed = true;
      });
    }

    const completionPercent = Math.round(
      (session.matchedTriplets.length / session.totalTriplets) * 100
    );

    if (session.matchedTriplets.length === session.totalTriplets) {
      session.completedAt = new Date();
      session.timeUsedSeconds = Math.round((session.completedAt - session.startedAt) / 1000);
      session.reward = {
        ...session.calculateReward(),
        earnedAt: new Date()
      };

      const suspicious = session.detectSuspiciousActivity();
      if (suspicious.suspicious) {
        session.speedAnalysis = {
          avgMoveTime: session.timeUsedSeconds / Math.max(1, session.matchAttempts),
          suspiciousPattern: true,
          flagReason: suspicious.reason
        };
      }

      session.status = 'completed';
    }

    await session.save();

    return {
      success: true,
      matched: matchResult.matched,
      matchedTripletId: matchResult.tripletId,
      completionPercent,
      gameComplete: session.status === 'completed',
      reward: session.status === 'completed' ? session.reward : null
    };
  },

  async complete(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const { gameSessionId } = payload;
    if (!gameSessionId) throw new GameEngineError('Missing gameSessionId', 400);

    const session = await GameSession.findById(gameSessionId);
    if (!session || session.telegramId !== telegramId) {
      throw new GameEngineError('Game session not found', 404);
    }
    if (session.status !== 'completed') {
      throw new GameEngineError('Game not completed', 400);
    }
    if (session.rewardClaimed) {
      throw new GameEngineError('Reward already claimed', 409);
    }

    const user = await User.findOne({ telegramId });
    if (!user) throw new GameEngineError('User not found', 404);

    let pointsAward = session.reward.points;
    let xpAward = session.reward.xp;
    if (session.speedAnalysis?.suspiciousPattern) {
      pointsAward = Math.floor(pointsAward * 0.5);
      xpAward = Math.floor(xpAward * 0.5);
    }

    user.points = (user.points || 0) + pointsAward;
    user.xp = (user.xp || 0) + xpAward;
    user.bronzeTickets = (user.bronzeTickets || 0) + (session.reward.bronzeTickets || 0);
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

    session.rewardClaimed = true;
    await session.save();

    return {
      success: true,
      reward: {
        points: pointsAward,
        xp: xpAward,
        bronzeTickets: session.reward.bronzeTickets || 0
      },
      stats: {
        moves: session.matchAttempts,
        time: session.timeUsedSeconds,
        completion: 100
      },
      newStats: {
        points: user.points,
        xp: user.xp,
        level: user.level,
        bronzeTickets: user.bronzeTickets
      }
    };
  },

  async getSession(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const { gameSessionId } = payload;
    if (!gameSessionId) throw new GameEngineError('Missing gameSessionId', 400);

    const session = await GameSession.findById(gameSessionId);
    if (!session || session.telegramId !== telegramId) {
      throw new GameEngineError('Game session not found', 404);
    }

    const elapsed = Math.round((new Date() - session.startedAt) / 1000);
    return {
      success: true,
      status: session.status,
      cards: toClientCards(session.cards),
      matchedCount: session.matchedTriplets.length,
      totalTriplets: session.totalTriplets,
      timeElapsed: elapsed,
      timeLimit: session.timeLimitSeconds,
      reward: session.status === 'completed' ? session.reward : null
    };
  },

  async abandon(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const { gameSessionId } = payload;
    if (!gameSessionId) throw new GameEngineError('Missing gameSessionId', 400);

    const session = await GameSession.findById(gameSessionId);
    if (!session || session.telegramId !== telegramId) {
      throw new GameEngineError('Game session not found', 404);
    }
    if (session.status === 'abandoned' || session.status === 'completed') {
      throw new GameEngineError('Game already ended', 400);
    }

    session.status = 'abandoned';
    await session.save();
    return { success: true, message: 'Game abandoned' };
  },

  async purchase(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const { txHash, txBoc } = payload;
    if (!txHash && !txBoc) {
      throw new GameEngineError('Missing transaction proof', 400);
    }

    const user = await User.findOne({ telegramId });
    if (!user) throw new GameEngineError('User not found', 404);

    const passInfo = await getActivePassInfo(user);
    if (passInfo.active) {
      return {
        success: true,
        message: 'Daily pass already active',
        passValidUntil: passInfo.validUntil,
        passCost: FLIPCARDS_PASS_USD,
        active: true
      };
    }

    const verification = await verifyTransaction({
      telegramId,
      txHash,
      txBoc,
      purpose: 'flipcards-pass',
      requiredUsd: FLIPCARDS_PASS_USD
    });
    if (!verification.ok) {
      throw new GameEngineError(verification.reason || 'Invalid payment', 400);
    }

    const validUntil = new Date(Date.now() + FLIPCARDS_PASS_DURATION_MS);
    user.flipcardsPass = {
      validUntil,
      purchasedAt: new Date(),
      txRef: verification.txRef || null
    };
    await user.save();

    return {
      success: true,
      message: 'Daily pass purchased and verified',
      passValidUntil: validUntil,
      passCost: FLIPCARDS_PASS_USD,
      active: true
    };
  },

  async getStatus(ctx) {
    const telegramId = getTelegramId(ctx);
    const user = await User.findOne({ telegramId });
    if (!user) throw new GameEngineError('User not found', 404);
    const passInfo = await getActivePassInfo(user);
    const active = passInfo.active;

    return {
      success: true,
      hasActivePass: active,
      passCost: FLIPCARDS_PASS_USD,
      passValidUntil: active ? passInfo.validUntil : null,
      requiresRevalidation: false
    };
  }
};
