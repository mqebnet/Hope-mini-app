const ArcadeGameSession = require('../../../models/ArcadeGameSession');
const User = require('../../../models/User');
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

const STANDARD_PALETTE = [
  { id: 'red', label: 'Red', short: 'R', hex: '#f14242' },
  { id: 'green', label: 'Green', short: 'G', hex: '#26b378' },
  { id: 'blue', label: 'Blue', short: 'B', hex: '#26a7f1' },
  { id: 'yellow', label: 'Yellow', short: 'Y', hex: '#f8cd23' }
];

const HARD_PALETTE = [
  { id: 'coral', label: 'Coral', short: 'C', hex: '#fa665c' },
  { id: 'amber', label: 'Amber', short: 'A', hex: '#ffb347' },
  { id: 'gold', label: 'Gold', short: 'G', hex: '#ffd866' },
  { id: 'lime', label: 'Lime', short: 'L', hex: '#9be564' },
  { id: 'cyan', label: 'Cyan', short: 'C', hex: '#59d4ff' },
  { id: 'violet', label: 'Violet', short: 'V', hex: '#b084ff' }
];

const DIFFICULTY_CONFIG = {
  easy: { totalBlocks: 6, timeLimitSeconds: 60, previewSeconds: 8, palette: STANDARD_PALETTE },
  normal: { totalBlocks: 10, timeLimitSeconds: 60, previewSeconds: 10, palette: STANDARD_PALETTE },
  hard: { totalBlocks: 12, timeLimitSeconds: 60, previewSeconds: 12, palette: HARD_PALETTE }
};

const HINT_COSTS = [
  { bronzeTickets: 10, points: 0 },
  { bronzeTickets: 20, points: 100 }
];
const HINT_REVEAL_SECONDS = 10;

function getConfig(difficulty) {
  return DIFFICULTY_CONFIG[normalizeDifficulty(difficulty)] || DIFFICULTY_CONFIG.normal;
}

function hintEnabledForDifficulty(difficulty) {
  return normalizeDifficulty(difficulty) !== 'easy';
}

function getHintUses(state = {}) {
  return Math.max(0, Number(state?.hintUses || 0));
}

function getHintNextCost(hintUses = 0) {
  const cost = HINT_COSTS[hintUses];
  return cost
    ? {
        bronzeTickets: Number(cost.bronzeTickets || 0),
        points: Number(cost.points || 0)
      }
    : { bronzeTickets: 0, points: 0 };
}

function formatHintCost(cost = {}) {
  const parts = [];
  if (Number(cost.bronzeTickets || 0) > 0) parts.push(`${Number(cost.bronzeTickets)} Bronze tickets`);
  if (Number(cost.points || 0) > 0) parts.push(`${Number(cost.points)} points`);
  return parts.join(' and ');
}

function buildHintState(session) {
  const enabled = hintEnabledForDifficulty(session?.difficulty);
  const used = enabled ? getHintUses(session?.state) : 0;
  const maxUses = enabled ? HINT_COSTS.length : 0;
  const remainingUses = enabled ? Math.max(0, maxUses - used) : 0;
  const nextCost = remainingUses > 0 ? getHintNextCost(used) : { bronzeTickets: 0, points: 0 };

  return {
    enabled,
    used,
    maxUses,
    remainingUses,
    nextCostBronze: Number(nextCost.bronzeTickets || 0),
    nextCostPoints: Number(nextCost.points || 0),
    revealSeconds: enabled ? HINT_REVEAL_SECONDS : 0
  };
}

function countColors(stack = []) {
  return stack.reduce((acc, colorId) => {
    acc[colorId] = Number(acc[colorId] || 0) + 1;
    return acc;
  }, {});
}

function buildTargetStack(totalBlocks, palette = STANDARD_PALETTE) {
  const paletteIds = Array.from(new Set((palette || []).map((item) => String(item?.id || '').trim()).filter(Boolean)));
  if (!paletteIds.length || totalBlocks <= 0) return [];

  // Use every available color at least once whenever possible.
  const seedCountPerColor = totalBlocks >= paletteIds.length ? 1 : 0;
  const counts = Object.fromEntries(paletteIds.map((id) => [id, seedCountPerColor]));
  let assigned = seedCountPerColor * paletteIds.length;
  let remaining = totalBlocks - assigned;

  // Distribute the rest as evenly as possible, then shuffle by weighted pick.
  if (remaining > 0) {
    const baseExtra = Math.floor(remaining / paletteIds.length);
    const extraRemainder = remaining % paletteIds.length;
    paletteIds.forEach((id) => {
      counts[id] += baseExtra;
      assigned += baseExtra;
    });
    remaining = totalBlocks - assigned;

    const shuffled = [...paletteIds];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    for (let i = 0; i < extraRemainder && i < shuffled.length; i += 1) {
      counts[shuffled[i]] += 1;
    }
  }

  const stack = [];
  let lastColor = null;
  let runLength = 0;

  while (stack.length < totalBlocks) {
    const candidates = paletteIds.filter((id) => counts[id] > 0 && !(id === lastColor && runLength >= 3));
    if (!candidates.length) {
      // Safety fallback; with balanced counts this path should be rare.
      const fallback = paletteIds.find((id) => counts[id] > 0);
      if (!fallback) break;
      stack.push(fallback);
      counts[fallback] -= 1;
      if (fallback === lastColor) runLength += 1;
      else {
        lastColor = fallback;
        runLength = 1;
      }
      continue;
    }

    // Weighted random pick by remaining count keeps sequence varied but fair.
    const totalWeight = candidates.reduce((sum, id) => sum + counts[id], 0);
    let roll = Math.random() * totalWeight;
    let pick = candidates[candidates.length - 1];
    for (const id of candidates) {
      roll -= counts[id];
      if (roll <= 0) {
        pick = id;
        break;
      }
    }

    stack.push(pick);
    counts[pick] -= 1;
    if (pick === lastColor) runLength += 1;
    else {
      lastColor = pick;
      runLength = 1;
    }
  }
  return stack;
}

function getAvailableCounts(targetStack = [], builtStack = []) {
  const totals = countColors(targetStack);
  const used = countColors(builtStack);
  return Object.fromEntries(
    Object.keys(totals).map((colorId) => [
      colorId,
      Math.max(0, Number(totals[colorId] || 0) - Number(used[colorId] || 0))
    ])
  );
}

function getElapsedSeconds(session) {
  return Math.max(0, Math.ceil((Date.now() - new Date(session.playStartsAt).getTime()) / 1000));
}

function buildStatePayload(session, options = {}) {
  const targetStack = Array.isArray(session.state?.targetStack) ? session.state.targetStack : [];
  const builtStack = Array.isArray(session.state?.builtStack) ? session.state.builtStack : [];
  const inventory = session.state?.inventory || countColors(targetStack);
  const availableCounts = getAvailableCounts(targetStack, builtStack);

  return {
    palette: session.state?.palette || STANDARD_PALETTE,
    inventory,
    availableCounts,
    builtStack,
    totalBlocks: targetStack.length,
    blocksPlaced: builtStack.length,
    mistakes: session.mistakes,
    moveCount: session.moveCount,
    towerLocked: builtStack.length === targetStack.length,
    towerMatches: builtStack.length === targetStack.length
      ? builtStack.join('|') === targetStack.join('|')
      : null,
    previewSeconds: session.metrics?.previewSeconds || 0,
    previewRemainingMs: Math.max(0, new Date(session.playStartsAt).getTime() - Date.now()),
    timeElapsed: Math.min(getElapsedSeconds(session), session.timeLimitSeconds),
    timeLimit: session.timeLimitSeconds,
    reward: session.status === 'completed' ? session.reward : null,
    hint: buildHintState(session),
    targetStack: options.includeTarget === true ? targetStack : null
  };
}

async function loadOwnedSession(telegramId, gameSessionId) {
  if (!gameSessionId) throw new GameEngineError('Missing gameSessionId', 400);
  const session = await ArcadeGameSession.findById(gameSessionId);
  if (!session || Number(session.telegramId) !== telegramId || session.gameType !== 'blocktower') {
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
  await session.save();
  return true;
}

async function persistMoveState(session, builtStack, options = {}) {
  const {
    markCompleted = false,
    updateMistakes = false
  } = options;

  const setPayload = {
    'state.builtStack': builtStack,
    moveCount: session.moveCount
  };

  if (updateMistakes) {
    setPayload.mistakes = session.mistakes;
  }

  if (markCompleted) {
    setPayload.status = session.status;
    setPayload.completedAt = session.completedAt;
    setPayload.timeUsedSeconds = session.timeUsedSeconds;
    setPayload.reward = session.reward;
  }

  // Lightweight atomic update instead of full document save on every move.
  const result = await ArcadeGameSession.updateOne(
    { _id: session._id, status: 'active', gameType: 'blocktower' },
    { $set: setPayload }
  );

  if (!result?.matchedCount) {
    throw new GameEngineError('Game is no longer active', 400);
  }
}

module.exports = {
  id: 'blocktower',
  version: '1.2.0',
  __test__: {
    buildHintState,
    getHintNextCost,
    hintEnabledForDifficulty
  },
  meta: {
    name: 'Block Tower',
    description: 'Memorize the tower, then rebuild it before the timer runs out.',
    icon: '\u{1F9F1}',
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
    const palette = Array.isArray(config.palette) && config.palette.length ? config.palette : STANDARD_PALETTE;
    const targetStack = buildTargetStack(config.totalBlocks, palette);
    const inventory = countColors(targetStack);
    const playStartsAt = new Date(Date.now() + config.previewSeconds * 1000);

    const session = await ArcadeGameSession.create({
      telegramId,
      gameType: 'blocktower',
      difficulty,
      timeLimitSeconds: config.timeLimitSeconds,
      playStartsAt,
      state: {
        palette,
        targetStack,
        inventory,
        builtStack: [],
        hintUses: 0
      },
      metrics: {
        previewSeconds: config.previewSeconds,
        totalBlocks: config.totalBlocks
      }
    });

    return {
      success: true,
      gameSessionId: session._id.toString(),
      difficulty,
      status: session.status,
      ...buildStatePayload(session, { includeTarget: true })
    };
  },

  async move(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const session = await loadOwnedSession(telegramId, payload?.gameSessionId);
    if (session.status !== 'active') throw new GameEngineError('Game is no longer active', 400);
    if (Date.now() < new Date(session.playStartsAt).getTime()) {
      throw new GameEngineError('Memorize the tower before stacking', 400);
    }
    if (await expireIfNeeded(session)) throw new GameEngineError('Time limit exceeded', 400);

    const action = String(payload?.action || 'add').toLowerCase();
    const targetStack = Array.isArray(session.state?.targetStack) ? [...session.state.targetStack] : [];
    const builtStack = Array.isArray(session.state?.builtStack) ? [...session.state.builtStack] : [];
    const inventory = session.state?.inventory || countColors(targetStack);

    if (action === 'hint') {
      if (!hintEnabledForDifficulty(session.difficulty)) {
        throw new GameEngineError('Hints are only available in Normal and Hard mode', 400);
      }

      const used = getHintUses(session.state);
      if (used >= HINT_COSTS.length) {
        throw new GameEngineError('No hint uses remaining for this run', 400);
      }

      const cost = getHintNextCost(used);
      const user = await User.findOneAndUpdate(
        {
          telegramId,
          bronzeTickets: { $gte: Number(cost.bronzeTickets || 0) },
          points: { $gte: Number(cost.points || 0) }
        },
        {
          $inc: {
            bronzeTickets: -Number(cost.bronzeTickets || 0),
            points: -Number(cost.points || 0)
          }
        },
        {
          new: true
        }
      ).select('points xp level bronzeTickets silverTickets goldTickets');

      if (!user) {
        throw new GameEngineError(`Need ${formatHintCost(cost)} to use this help`, 400);
      }

      const nextHintUses = used + 1;
      const result = await ArcadeGameSession.updateOne(
        { _id: session._id, status: 'active', gameType: 'blocktower' },
        { $set: { 'state.hintUses': nextHintUses } }
      );

      if (!result?.matchedCount) {
        await User.updateOne({
          telegramId
        }, {
          $inc: {
            bronzeTickets: Number(cost.bronzeTickets || 0),
            points: Number(cost.points || 0)
          }
        });
        throw new GameEngineError('Game is no longer active', 400);
      }

      session.state.hintUses = nextHintUses;

      return {
        success: true,
        status: session.status,
        ...buildStatePayload(session, { includeTarget: true }),
        hintReveal: {
          durationSeconds: HINT_REVEAL_SECONDS,
          targetStack
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
    }

    session.moveCount += 1;

    if (action === 'add') {
      const colorId = String(payload?.colorId || '');
      if (!inventory[colorId]) throw new GameEngineError('Invalid block color', 400);
      if (builtStack.length >= targetStack.length) {
        throw new GameEngineError('Tower is full. Remove the top block to rebuild.', 400);
      }

      const availableCounts = getAvailableCounts(targetStack, builtStack);
      if (Number(availableCounts[colorId] || 0) <= 0) {
        throw new GameEngineError('No more blocks of that color left in the tray', 400);
      }

      builtStack.push(colorId);
    } else if (action === 'remove') {
      const removeIndex = Number(payload?.removeIndex);
      if (!builtStack.length) throw new GameEngineError('No blocks to remove', 400);
      if (!Number.isInteger(removeIndex) || removeIndex !== builtStack.length - 1) {
        throw new GameEngineError('Only the top block can be removed', 400);
      }
      builtStack.pop();
    } else {
      throw new GameEngineError('Unsupported block action', 400);
    }

    session.state.builtStack = builtStack;

    let towerLocked = false;
    let towerMatches = null;
    let updateMistakes = false;
    let markCompleted = false;
    if (builtStack.length === targetStack.length) {
      towerLocked = true;
      towerMatches = builtStack.join('|') === targetStack.join('|');
      if (towerMatches) {
        session.status = 'completed';
        session.completedAt = new Date();
        session.timeUsedSeconds = Math.max(1, getElapsedSeconds(session));
        session.reward = {
          ...calculateSharedReward({
            difficulty: session.difficulty,
            timeUsedSeconds: session.timeUsedSeconds,
            timeLimitSeconds: session.timeLimitSeconds,
            mistakes: session.mistakes,
            perfect: session.mistakes === 0
          }),
          earnedAt: new Date()
        };
        markCompleted = true;
      } else if (action === 'add') {
        session.mistakes += 1;
        updateMistakes = true;
      }
    }

    await persistMoveState(session, builtStack, { markCompleted, updateMistakes });

    return {
      success: true,
      status: session.status,
      ...buildStatePayload(session),
      towerLocked,
      towerMatches,
      gameComplete: session.status === 'completed',
      reward: session.status === 'completed' ? session.reward : null
    };
  },

  async complete(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const session = await loadOwnedSession(telegramId, payload?.gameSessionId);
    if (session.status !== 'completed') throw new GameEngineError('Game not completed', 400);
    if (session.rewardClaimed) throw new GameEngineError('Reward already claimed', 409);

    const { user, appliedReward } = await applyRewardToUser({
      telegramId,
      reward: session.reward
    });

    session.rewardClaimed = true;
    await session.save();

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

    return {
      success: true,
      status: session.status,
      ...buildStatePayload(session, {
        includeTarget: Math.max(0, new Date(session.playStartsAt).getTime() - Date.now()) > 0
      })
    };
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
      sourceGameId: 'blocktower'
    });
  },

  async getStatus(ctx) {
    return getSharedPassStatus(getTelegramId(ctx));
  }
};
