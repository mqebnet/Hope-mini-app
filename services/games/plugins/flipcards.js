const GameSession = require('../../../models/GameSession');
const User = require('../../../models/User');
const { getUserLevel } = require('../../../utils/levelUtil');
const stateEmitter = require('../../../utils/stateEmitter');
const { GameEngineError } = require('../GameEngine');
const {
  GAME_PASS_USD,
  getTelegramId,
  getActivePassInfo,
  purchaseSharedGamePass,
  getSharedPassStatus
} = require('../sharedSupport');

function toClientCards(cards = []) {
  return cards.map((card) => ({
    id: card.id,
    symbol: card.symbol,
    revealed: card.revealed
  }));
}

module.exports = {
  id: 'flipcards',
  version: '1.0.0',
  meta: {
    name: 'Flip Cards',
    description: `Match triplets of cards to win rewards.`,
    icon: '🎴',
    type: 'skill',
    category: 'games',
    entryFeeUsd: GAME_PASS_USD,
    dailyPassRequired: true
  },

  async start(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const user = await User.findOne({ telegramId });
    if (!user) throw new GameEngineError('User not found', 404);

    const passInfo = await getActivePassInfo(user);
    if (!passInfo.active) {
      throw new GameEngineError(`Daily game pass required. Purchase for $${GAME_PASS_USD.toFixed(2)} to play all pass games for 24 hours.`, 402);
    }

    const { difficulty = 'normal' } = payload;
    const tripletMap = { easy: 3, normal: 4, hard: 5 };
    const numTriplets = tripletMap[difficulty] || 4;
    const gameData = GameSession.generateGame(numTriplets);
    const timeLimitMap = { easy: 60, normal: 45, hard: 45 };
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
    user.silverTickets = (user.silverTickets || 0) + (session.reward.silverTickets || 0);
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
        bronzeTickets: session.reward.bronzeTickets || 0,
        silverTickets: session.reward.silverTickets || 0
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
        bronzeTickets: user.bronzeTickets,
        silverTickets: user.silverTickets
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
    return purchaseSharedGamePass({
      telegramId,
      txHash: payload?.txHash,
      txBoc: payload?.txBoc,
      sourceGameId: 'flipcards'
    });
  },

  async getStatus(ctx) {
    const telegramId = getTelegramId(ctx);
    return getSharedPassStatus(telegramId);
  }
};
