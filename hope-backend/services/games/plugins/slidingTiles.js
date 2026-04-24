const ArcadeGameSession = require('../../../models/ArcadeGameSession');
const { GameEngineError } = require('../GameEngine');
const {
  GAME_PASS_USD,
  getTelegramId,
  loadUserWithActivePass,
  purchaseSharedGamePass,
  getSharedPassStatus,
  normalizeDifficulty,
  calculateSharedReward,
  applyRewardToUser
} = require('../sharedSupport');

const DIFFICULTY_CONFIG = {
  easy: { size: 3, timeLimitSeconds: 75, scrambleMoves: 18 },
  normal: { size: 4, timeLimitSeconds: 110, scrambleMoves: 42 },
  hard: { size: 5, timeLimitSeconds: 150, scrambleMoves: 75 }
};

function getConfig(difficulty) {
  return DIFFICULTY_CONFIG[normalizeDifficulty(difficulty)] || DIFFICULTY_CONFIG.normal;
}

function buildSolvedBoard(size) {
  return Array.from({ length: size * size }, (_, index) => (index === size * size - 1 ? 0 : index + 1));
}

function getNeighbors(emptyIndex, size) {
  const row = Math.floor(emptyIndex / size);
  const col = emptyIndex % size;
  const neighbors = [];
  if (row > 0) neighbors.push(emptyIndex - size);
  if (row < size - 1) neighbors.push(emptyIndex + size);
  if (col > 0) neighbors.push(emptyIndex - 1);
  if (col < size - 1) neighbors.push(emptyIndex + 1);
  return neighbors;
}

function shuffleBoard(size, scrambleMoves) {
  const board = buildSolvedBoard(size);
  let emptyIndex = board.indexOf(0);
  let previousEmptyIndex = -1;

  for (let i = 0; i < scrambleMoves; i += 1) {
    const candidates = getNeighbors(emptyIndex, size).filter((index) => index !== previousEmptyIndex);
    const nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
    [board[emptyIndex], board[nextIndex]] = [board[nextIndex], board[emptyIndex]];
    previousEmptyIndex = emptyIndex;
    emptyIndex = nextIndex;
  }

  return { board, emptyIndex };
}

function isSolved(board) {
  return board.every((value, index) => value === (index === board.length - 1 ? 0 : index + 1));
}

function completionPercent(board) {
  const correctTiles = board.reduce((count, value, index) => {
    if (value === 0) return count;
    return count + (value === index + 1 ? 1 : 0);
  }, 0);
  return Math.round((correctTiles / Math.max(1, board.length - 1)) * 100);
}

function getElapsedSeconds(session) {
  return Math.max(0, Math.ceil((Date.now() - new Date(session.playStartsAt).getTime()) / 1000));
}

async function loadOwnedSession(telegramId, gameSessionId, select = '') {
  if (!gameSessionId) throw new GameEngineError('Missing gameSessionId', 400);
  const query = ArcadeGameSession.findOne({ _id: gameSessionId, telegramId, gameType: 'slidingtiles' });
  if (select) query.select(select);
  const session = await query;
  if (!session) {
    throw new GameEngineError('Game session not found', 404);
  }
  return session;
}

async function expireIfNeeded(session) {
  if (session.status !== 'active') return false;
  const elapsed = getElapsedSeconds(session);
  if (elapsed <= session.timeLimitSeconds) return false;

  session.status = 'expired';
  session.timeUsedSeconds = session.timeLimitSeconds;
  await ArcadeGameSession.updateOne(
    { _id: session._id },
    {
      $set: {
        status: 'expired',
        timeUsedSeconds: session.timeLimitSeconds
      }
    }
  );
  return true;
}

module.exports = {
  id: 'slidingtiles',
  version: '1.0.0',
  meta: {
    name: 'Sliding Tiles',
    description: `Rebuild the neon grid before the timer runs out.`,
    icon: '🧩',
    type: 'skill',
    category: 'games',
    entryFeeUsd: GAME_PASS_USD,
    dailyPassRequired: true
  },

  async start(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const { user, passInfo } = await loadUserWithActivePass(telegramId);
    if (!user) throw new GameEngineError('User not found', 404);
    if (!passInfo.active) {
      throw new GameEngineError(`Daily game pass required. Purchase for $${GAME_PASS_USD.toFixed(2)} to play all pass games for 24 hours.`, 402);
    }

    const difficulty = normalizeDifficulty(payload?.difficulty);
    const config = getConfig(difficulty);
    const { board, emptyIndex } = shuffleBoard(config.size, config.scrambleMoves);

    const session = await ArcadeGameSession.create({
      telegramId,
      gameType: 'slidingtiles',
      difficulty,
      timeLimitSeconds: config.timeLimitSeconds,
      state: {
        board,
        emptyIndex,
        size: config.size
      },
      metrics: {
        scrambleMoves: config.scrambleMoves
      }
    });

    return {
      success: true,
      gameSessionId: session._id.toString(),
      difficulty,
      timeLimit: config.timeLimitSeconds,
      size: config.size,
      board,
      moveCount: 0,
      completionPercent: completionPercent(board)
    };
  },

  async move(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const session = await loadOwnedSession(
      telegramId,
      payload?.gameSessionId,
      'status playStartsAt timeLimitSeconds timeUsedSeconds moveCount mistakes difficulty reward state completedAt'
    );
    if (session.status !== 'active') throw new GameEngineError('Game is no longer active', 400);
    if (await expireIfNeeded(session)) throw new GameEngineError('Time limit exceeded', 400);

    const tileIndex = Number(payload?.tileIndex);
    if (!Number.isInteger(tileIndex)) throw new GameEngineError('Missing tileIndex', 400);

    const board = Array.isArray(session.state?.board) ? [...session.state.board] : [];
    const size = Number(session.state?.size || 0);
    const emptyIndex = Number(session.state?.emptyIndex);
    if (!board.length || !size || !Number.isInteger(emptyIndex)) {
      throw new GameEngineError('Game state corrupted', 500);
    }
    if (tileIndex < 0 || tileIndex >= board.length || board[tileIndex] === 0) {
      throw new GameEngineError('Invalid tile move', 400);
    }
    if (!getNeighbors(emptyIndex, size).includes(tileIndex)) {
      throw new GameEngineError('Tile is not adjacent to the empty slot', 400);
    }

    [board[emptyIndex], board[tileIndex]] = [board[tileIndex], board[emptyIndex]];
    const nextMoveCount = Number(session.moveCount || 0) + 1;
    let nextStatus = session.status;
    let nextCompletedAt = session.completedAt || null;
    let nextTimeUsedSeconds = Number(session.timeUsedSeconds || 0);
    let nextReward = session.reward || null;

    const solved = isSolved(board);
    if (solved) {
      nextStatus = 'completed';
      nextCompletedAt = new Date();
      nextTimeUsedSeconds = Math.max(1, getElapsedSeconds(session));
      nextReward = {
        ...calculateSharedReward({
          difficulty: session.difficulty,
          timeUsedSeconds: nextTimeUsedSeconds,
          timeLimitSeconds: session.timeLimitSeconds,
          mistakes: session.mistakes,
          perfect: session.mistakes === 0
        }),
        earnedAt: nextCompletedAt
      };
    }

    await ArcadeGameSession.updateOne(
      { _id: session._id },
      {
        $set: {
          'state.board': board,
          'state.emptyIndex': tileIndex,
          moveCount: nextMoveCount,
          status: nextStatus,
          completedAt: nextCompletedAt,
          timeUsedSeconds: nextTimeUsedSeconds,
          reward: nextReward
        }
      }
    );

    return {
      success: true,
      board,
      moveCount: nextMoveCount,
      mistakes: session.mistakes,
      completionPercent: completionPercent(board),
      gameComplete: solved,
      reward: solved ? nextReward : null
    };
  },

  async complete(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const session = await loadOwnedSession(
      telegramId,
      payload?.gameSessionId,
      'status reward rewardClaimed moveCount timeUsedSeconds'
    );
    if (session.status !== 'completed') throw new GameEngineError('Game not completed', 400);
    if (session.rewardClaimed) throw new GameEngineError('Reward already claimed', 409);

    const { user, appliedReward } = await applyRewardToUser({
      telegramId,
      reward: session.reward
    });

    await ArcadeGameSession.updateOne(
      { _id: session._id },
      { $set: { rewardClaimed: true } }
    );

    return {
      success: true,
      reward: appliedReward,
      stats: {
        moves: session.moveCount,
        time: session.timeUsedSeconds,
        completion: 100
      },
      newStats: {
        points: user.points,
        xp: user.xp,
        level: user.level,
        bronzeTickets: user.bronzeTickets,
        silverTickets: user.silverTickets,
        goldTickets: user.goldTickets
      }
    };
  },

  async getSession(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const session = await loadOwnedSession(
      telegramId,
      payload?.gameSessionId,
      'status playStartsAt timeLimitSeconds moveCount mistakes reward state'
    );
    await expireIfNeeded(session);

    return {
      success: true,
      status: session.status,
      board: session.state?.board || [],
      size: session.state?.size || 0,
      moveCount: session.moveCount,
      mistakes: session.mistakes,
      timeElapsed: Math.min(getElapsedSeconds(session), session.timeLimitSeconds),
      timeLimit: session.timeLimitSeconds,
      completionPercent: completionPercent(session.state?.board || []),
      reward: session.status === 'completed' ? session.reward : null
    };
  },

  async abandon(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const session = await loadOwnedSession(telegramId, payload?.gameSessionId, 'status');
    if (session.status === 'abandoned' || session.status === 'completed' || session.status === 'expired') {
      throw new GameEngineError('Game already ended', 400);
    }

    await ArcadeGameSession.updateOne(
      { _id: session._id },
      { $set: { status: 'abandoned' } }
    );
    return { success: true, message: 'Game abandoned' };
  },

  async purchase(ctx, payload = {}) {
    return purchaseSharedGamePass({
      telegramId: getTelegramId(ctx),
      txHash: payload?.txHash,
      txBoc: payload?.txBoc,
      sourceGameId: 'slidingtiles'
    });
  },

  async getStatus(ctx) {
    return getSharedPassStatus(getTelegramId(ctx));
  }
};
