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

const CUPS = ['A', 'B', 'C'];
const TOTAL_ROUNDS = 5;
const ROUND_TIMEOUT_BUFFER_MS = 500;
const ROUND_REVEAL_MS = 900;
const ROUND_HIDE_MS = 220;
const ROUND_SWAP_GAP_MS = 80;
const ROUND_START_SYNC_BUFFER_MS = 300;

/**
 * Difficulty rules for Red ball.
 *
 * `timeLimitSeconds` acts as a whole-session safety expiry so abandoned active
 * sessions eventually stop being resumable. Per-round guess validation still
 * uses `roundStartedAt` plus `decisionTimerSeconds`.
 */
const DIFFICULTY_CONFIG = {
  easy: {
    totalRounds: TOTAL_ROUNDS,
    shuffleCount: 3,
    decisionTimerSeconds: 9,
    speedHint: 'slow',
    timeLimitSeconds: 75
  },
  normal: {
    totalRounds: TOTAL_ROUNDS,
    shuffleCount: 5,
    decisionTimerSeconds: 7,
    speedHint: 'medium',
    timeLimitSeconds: 65
  },
  hard: {
    totalRounds: TOTAL_ROUNDS,
    shuffleCount: 7,
    decisionTimerSeconds: 5,
    speedHint: 'fast',
    timeLimitSeconds: 55
  }
};

function getConfig(difficulty) {
  return DIFFICULTY_CONFIG[normalizeDifficulty(difficulty)] || DIFFICULTY_CONFIG.normal;
}

function pickRandomCup() {
  return CUPS[Math.floor(Math.random() * CUPS.length)];
}

function getShuffleStepMs(shuffleCount) {
  return Math.max(320, Math.round(2100 / Math.max(1, Number(shuffleCount || 1))));
}

function getRoundLeadMs(difficulty) {
  const config = getConfig(difficulty);
  return ROUND_START_SYNC_BUFFER_MS +
    ROUND_REVEAL_MS +
    ROUND_HIDE_MS +
    (config.shuffleCount * (getShuffleStepMs(config.shuffleCount) + ROUND_SWAP_GAP_MS));
}

/**
 * Generate the server-side cup swap sequence for a round.
 *
 * @param {number} shuffleCount
 * @returns {string[][]}
 */
function generateShuffleSequence(shuffleCount) {
  const sequence = [];
  for (let i = 0; i < shuffleCount; i += 1) {
    const a = Math.floor(Math.random() * 3);
    let b = Math.floor(Math.random() * 2);
    if (b >= a) b += 1;
    sequence.push([CUPS[a], CUPS[b]]);
  }
  return sequence;
}

/**
 * Apply the generated swaps and return the cup holding the ball after all
 * shuffles finish.
 *
 * @param {string} ballCupId
 * @param {string[][]} sequence
 * @returns {string}
 */
function applyShuffles(ballCupId, sequence) {
  let ball = ballCupId;
  for (const [leftCupId, rightCupId] of sequence) {
    if (ball === leftCupId) ball = rightCupId;
    else if (ball === rightCupId) ball = leftCupId;
  }
  return ball;
}

/**
 * Build the server-owned state for a round.
 *
 * The client receives `startingBallCupId` so it can render the visible reveal
 * before shuffling, while `ballCupId` remains server-only until a guess is
 * processed.
 */
function buildRoundState(difficulty) {
  const config = getConfig(difficulty);
  const startingBallCupId = pickRandomCup();
  const shuffleSequence = generateShuffleSequence(config.shuffleCount);

  return {
    cups: [...CUPS],
    startingBallCupId,
    ballCupId: applyShuffles(startingBallCupId, shuffleSequence),
    shuffleCount: config.shuffleCount,
    shuffleSequence,
    decisionTimerSeconds: config.decisionTimerSeconds,
    roundStartedAt: null
  };
}

function getElapsedSeconds(session) {
  const startedAt = new Date(session.playStartsAt || session.startedAt || Date.now()).getTime();
  return Math.max(0, Math.ceil((Date.now() - startedAt) / 1000));
}

function getRoundResults(state) {
  return Array.isArray(state?.roundResults) ? state.roundResults : [];
}

function getCurrentRound(state) {
  return Math.max(1, Number(state?.currentRound || 1));
}

function getCurrentRoundResult(state) {
  const currentRound = getCurrentRound(state);
  return getRoundResults(state).find((entry) => Number(entry?.round) === currentRound) || null;
}

function isCurrentRoundResolved(state) {
  return Boolean(getCurrentRoundResult(state));
}

/**
 * Resolve the current guess and determine whether the run is still active, won,
 * or lost.
 *
 * @param {object} params
 * @param {string} params.difficulty
 * @param {number} params.currentRound
 * @param {number} params.correctCount
 * @param {number} params.consecutiveStreak
 * @param {boolean} params.correct
 * @returns {'win'|'loss'|null}
 */
function evaluateGameState({ difficulty, currentRound, correctCount, consecutiveStreak, correct }) {
  const remainingRounds = TOTAL_ROUNDS - currentRound;

  if (difficulty === 'hard') {
    if (!correct) return 'loss';
    return correctCount >= TOTAL_ROUNDS ? 'win' : null;
  }

  if (difficulty === 'normal') {
    if (consecutiveStreak >= 3) return 'win';
    if (currentRound >= TOTAL_ROUNDS) return 'loss';
    if ((consecutiveStreak + remainingRounds) < 3) return 'loss';
    return null;
  }

  if (correctCount >= 3) return 'win';
  if (currentRound >= TOTAL_ROUNDS) return 'loss';
  if ((correctCount + remainingRounds) < 3) return 'loss';
  return null;
}

function buildReward(session, correctCount) {
  return {
    ...calculateSharedReward({
      difficulty: session.difficulty,
      timeUsedSeconds: session.timeUsedSeconds,
      timeLimitSeconds: session.timeLimitSeconds,
      mistakes: TOTAL_ROUNDS - Number(correctCount || 0),
      perfect: Number(correctCount || 0) === TOTAL_ROUNDS
    }),
    earnedAt: new Date()
  };
}

function buildSessionPayload(session) {
  const state = session.state || {};
  const currentRoundResult = getCurrentRoundResult(state);
  const roundResolved = Boolean(currentRoundResult);

  return {
    success: true,
    gameSessionId: session._id.toString(),
    status: session.status,
    difficulty: session.difficulty,
    totalRounds: TOTAL_ROUNDS,
    currentRound: getCurrentRound(state),
    cups: Array.isArray(state.cups) && state.cups.length ? state.cups : [...CUPS],
    startingBallCupId: roundResolved ? null : state.startingBallCupId || null,
    shuffleCount: Number(state.shuffleCount || getConfig(session.difficulty).shuffleCount),
    shuffleSequence: Array.isArray(state.shuffleSequence) ? state.shuffleSequence : [],
    decisionTimerSeconds: Number(state.decisionTimerSeconds || getConfig(session.difficulty).decisionTimerSeconds),
    roundStartedAt: state.roundStartedAt || null,
    roundResults: getRoundResults(state),
    roundResolved,
    correctCount: Number(state.correctCount || 0),
    consecutiveStreak: Number(state.consecutiveStreak || 0),
    gameResult: state.gameResult || null,
    rewardClaimed: Boolean(session.rewardClaimed),
    reward: session.status === 'completed' && state.gameResult === 'win' ? session.reward : null,
    timeElapsed: Math.min(getElapsedSeconds(session), Number(session.timeLimitSeconds || 0)),
    timeLimit: Number(session.timeLimitSeconds || 0),
    lastRoundResult: currentRoundResult
      ? {
          round: Number(currentRoundResult.round || getCurrentRound(state)),
          guessedCupId: currentRoundResult.guessedCupId || null,
          correct: Boolean(currentRoundResult.correct),
          correctCupId: currentRoundResult.correctCupId || null,
          timestamp: currentRoundResult.timestamp || null,
          timedOut: Boolean(currentRoundResult.timedOut)
        }
      : null
  };
}

async function loadOwnedSession(telegramId, gameSessionId, select = '') {
  if (!gameSessionId) throw new GameEngineError('Missing gameSessionId', 400);
  const query = ArcadeGameSession.findById(gameSessionId);
  if (select) query.select(select);
  const session = await query;
  if (!session || Number(session.telegramId) !== telegramId || session.gameType !== 'shellgame') {
    throw new GameEngineError('Game session not found', 404);
  }
  return session;
}

async function expireIfNeeded(session) {
  if (session.status !== 'active') return false;
  const elapsed = getElapsedSeconds(session);
  if (elapsed <= Number(session.timeLimitSeconds || 0)) return false;

  session.status = 'expired';
  session.completedAt = new Date();
  session.timeUsedSeconds = Number(session.timeLimitSeconds || elapsed);
  session.state = {
    ...(session.state || {}),
    gameResult: 'loss'
  };
  await session.save();
  return true;
}

module.exports = {
  id: 'shellgame',
  version: '1.0.0',
  meta: {
    name: 'Red ball',
    description: 'Watch the red ball, follow the cups, trust your eyes.',
    icon: '\u{1F534}',
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
      throw new GameEngineError(
        `Daily game pass required. Purchase for $${GAME_PASS_USD.toFixed(2)} to play all pass games for 24 hours.`,
        402
      );
    }

    const difficulty = normalizeDifficulty(payload?.difficulty);
    const config = getConfig(difficulty);
    const roundState = buildRoundState(difficulty);
    const playStartsAt = new Date();

    const session = await ArcadeGameSession.create({
      telegramId,
      gameType: 'shellgame',
      difficulty,
      playStartsAt,
      timeLimitSeconds: config.timeLimitSeconds,
      state: {
        ...roundState,
        currentRound: 1,
        roundResults: [],
        correctCount: 0,
        consecutiveStreak: 0,
        gameResult: null
      },
      metrics: {
        speedHint: config.speedHint,
        totalRounds: config.totalRounds
      }
    });

    return {
      success: true,
      gameSessionId: session._id.toString(),
      difficulty,
      totalRounds: config.totalRounds,
      currentRound: 1,
      shuffleSequence: roundState.shuffleSequence,
      shuffleCount: roundState.shuffleCount,
      decisionTimerSeconds: roundState.decisionTimerSeconds,
      cups: [...CUPS],
      startingBallCupId: roundState.startingBallCupId,
      roundStartedAt: roundState.roundStartedAt
    };
  },

  async move(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const session = await loadOwnedSession(telegramId, payload?.gameSessionId);
    if (session.status !== 'active') throw new GameEngineError('Game is no longer active', 400);
    if (await expireIfNeeded(session)) throw new GameEngineError('Time limit exceeded', 400);

    const action = String(payload?.action || 'guess').toLowerCase();
    const state = session.state || {};
    const currentRound = getCurrentRound(state);

    if (action === 'new_round') {
      if (state.gameResult) throw new GameEngineError('Game already ended', 400);
      if (currentRound >= TOTAL_ROUNDS) throw new GameEngineError('No more rounds available', 400);
      if (!isCurrentRoundResolved(state)) {
        throw new GameEngineError('Resolve the current round before starting a new one', 400);
      }

      const roundState = buildRoundState(session.difficulty);
      const result = await ArcadeGameSession.updateOne(
        {
          _id: session._id,
          gameType: 'shellgame',
          status: 'active',
          'state.currentRound': currentRound
        },
        {
          $set: {
            'state.currentRound': currentRound + 1,
            'state.startingBallCupId': roundState.startingBallCupId,
            'state.ballCupId': roundState.ballCupId,
            'state.shuffleCount': roundState.shuffleCount,
            'state.shuffleSequence': roundState.shuffleSequence,
            'state.decisionTimerSeconds': roundState.decisionTimerSeconds,
            'state.roundStartedAt': roundState.roundStartedAt
          }
        }
      );

      if (!result?.matchedCount) {
        throw new GameEngineError('Game is no longer active', 400);
      }

      return {
        success: true,
        currentRound: currentRound + 1,
        shuffleSequence: roundState.shuffleSequence,
        shuffleCount: roundState.shuffleCount,
        decisionTimerSeconds: roundState.decisionTimerSeconds,
        cups: [...CUPS],
        startingBallCupId: roundState.startingBallCupId,
        roundStartedAt: roundState.roundStartedAt
      };
    }

    if (action === 'begin_round') {
      if (state.gameResult) throw new GameEngineError('Game already ended', 400);
      if (isCurrentRoundResolved(state)) {
        throw new GameEngineError('Round already resolved. Start the next round.', 400);
      }
      if (state.roundStartedAt) {
        return {
          success: true,
          currentRound,
          roundStartedAt: state.roundStartedAt,
          decisionTimerSeconds: Number(state.decisionTimerSeconds || getConfig(session.difficulty).decisionTimerSeconds)
        };
      }

      const roundStartedAt = new Date(Date.now() + getRoundLeadMs(session.difficulty));
      const result = await ArcadeGameSession.updateOne(
        {
          _id: session._id,
          gameType: 'shellgame',
          status: 'active',
          'state.currentRound': currentRound,
          'state.roundStartedAt': null
        },
        {
          $set: {
            'state.roundStartedAt': roundStartedAt
          }
        }
      );

      if (!result?.matchedCount) {
        throw new GameEngineError('Game is no longer active', 400);
      }

      return {
        success: true,
        currentRound,
        roundStartedAt,
        decisionTimerSeconds: Number(state.decisionTimerSeconds || getConfig(session.difficulty).decisionTimerSeconds)
      };
    }

    if (action !== 'guess') {
      throw new GameEngineError('Unsupported shell game action', 400);
    }

    if (state.gameResult) throw new GameEngineError('Game already ended', 400);
    if (isCurrentRoundResolved(state)) {
      throw new GameEngineError('Round already resolved. Start the next round.', 400);
    }
    if (!state.roundStartedAt) {
      throw new GameEngineError('Round has not started yet', 400);
    }

    const deadlineMs =
      new Date(state.roundStartedAt || Date.now()).getTime() +
      (Number(state.decisionTimerSeconds || 0) * 1000) +
      ROUND_TIMEOUT_BUFFER_MS;
    const now = Date.now();
    const requestedTimeout = Boolean(payload?.timedOut);
    const timedOut = requestedTimeout || now > deadlineMs;

    const rawGuess = typeof payload?.guessedCupId === 'string' ? payload.guessedCupId.trim().toUpperCase() : null;
    const guessedCupId = CUPS.includes(rawGuess) ? rawGuess : null;
    if (!timedOut && !guessedCupId) {
      throw new GameEngineError('Missing guessedCupId', 400);
    }

    const correct = !timedOut && guessedCupId === state.ballCupId;
    const nextRoundResults = [
      ...getRoundResults(state),
      {
        round: currentRound,
        guessedCupId,
        correct,
        correctCupId: state.ballCupId,
        timedOut,
        timestamp: new Date(now)
      }
    ];
    const nextCorrectCount = Number(state.correctCount || 0) + (correct ? 1 : 0);
    const nextConsecutiveStreak = correct ? Number(state.consecutiveStreak || 0) + 1 : 0;
    const gameResult = evaluateGameState({
      difficulty: session.difficulty,
      currentRound,
      correctCount: nextCorrectCount,
      consecutiveStreak: nextConsecutiveStreak,
      correct
    });

    const completedAt = gameResult ? new Date(now) : null;
    const nextTimeUsedSeconds = gameResult ? Math.max(1, getElapsedSeconds(session)) : Number(session.timeUsedSeconds || 0);
    const nextReward = gameResult === 'win'
      ? (() => {
          session.timeUsedSeconds = nextTimeUsedSeconds;
          return buildReward(session, nextCorrectCount);
        })()
      : session.reward;

    const result = await ArcadeGameSession.updateOne(
      {
        _id: session._id,
        gameType: 'shellgame',
        status: 'active',
        moveCount: Number(session.moveCount || 0)
      },
      {
        $set: {
          moveCount: Number(session.moveCount || 0) + 1,
          mistakes: nextRoundResults.filter((entry) => !entry.correct).length,
          status: gameResult ? 'completed' : 'active',
          completedAt,
          timeUsedSeconds: nextTimeUsedSeconds,
          reward: gameResult === 'win' ? nextReward : session.reward,
          'state.roundResults': nextRoundResults,
          'state.correctCount': nextCorrectCount,
          'state.consecutiveStreak': nextConsecutiveStreak,
          'state.gameResult': gameResult
        }
      }
    );

    if (!result?.matchedCount) {
      throw new GameEngineError('Game is no longer active', 400);
    }

    return {
      success: true,
      correct,
      correctCupId: state.ballCupId,
      roundResult: {
        round: currentRound,
        guessedCupId,
        correct,
        timedOut
      },
      correctCount: nextCorrectCount,
      consecutiveStreak: nextConsecutiveStreak,
      currentRound,
      gameOver: Boolean(gameResult),
      gameResult: gameResult || null,
      reward: gameResult === 'win' ? nextReward : null
    };
  },

  async complete(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const session = await loadOwnedSession(telegramId, payload?.gameSessionId);
    if (session.status !== 'completed') throw new GameEngineError('Game not completed', 400);
    if (session.state?.gameResult !== 'win') throw new GameEngineError('Rewards are only available for wins', 400);
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
    const session = await loadOwnedSession(telegramId, payload?.gameSessionId);
    await expireIfNeeded(session);
    return buildSessionPayload(session);
  },

  async abandon(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const session = await loadOwnedSession(telegramId, payload?.gameSessionId);
    if (session.status === 'abandoned' || session.status === 'completed' || session.status === 'expired') {
      throw new GameEngineError('Game already ended', 400);
    }

    session.status = 'abandoned';
    await session.save();
    return { success: true, message: 'Game abandoned' };
  },

  async purchase(ctx, payload = {}) {
    return purchaseSharedGamePass({
      telegramId: getTelegramId(ctx),
      txHash: payload?.txHash,
      txBoc: payload?.txBoc,
      sourceGameId: 'shellgame'
    });
  },

  async getStatus(ctx) {
    return getSharedPassStatus(getTelegramId(ctx));
  }
};
