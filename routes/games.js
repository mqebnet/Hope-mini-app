const express = require('express');
const router = express.Router();
const GameSession = require('../models/GameSession');
const User = require('../models/User');
const apiAuth = require('../middleware/apiAuth');

/**
 * POST /api/games/flipcards/start
 * Initialize a new Flip Cards game session
 *
 * Query params:
 *   difficulty: 'easy' (3 triplets), 'normal' (4 triplets), 'hard' (5 triplets)
 *
 * Returns: { gameSessionId, cards (with symbols only, no tripletId), timeLimit }
 */
router.post('/flipcards/start', apiAuth, async (req, res) => {
  try {
    const { difficulty = 'normal' } = req.body;

    // Map difficulty to triplet count
    const tripletMap = { easy: 3, normal: 4, hard: 5 };
    const numTriplets = tripletMap[difficulty] || 4;

    // Generate shuffled game
    const gameData = GameSession.generateGame(numTriplets);

    // Create game session
    const session = new GameSession({
      telegramId: req.user,
      gameType: 'flipcards',
      cards: gameData.cards,
      cardStateChecksum: gameData.checksum,
      totalTriplets: gameData.totalTriplets,
      startedAt: new Date(),
      timeLimitSeconds: 60
    });

    await session.save();

    // Return game state WITHOUT tripletId (anti-cheat: client shouldn't know triplet grouping)
    const clientCards = session.cards.map((card) => ({
      id: card.id,
      symbol: card.symbol,
      revealed: card.revealed
    }));

    return res.json({
      success: true,
      gameSessionId: session._id.toString(),
      cards: clientCards,
      totalPairs: session.totalTriplets * 3, // Visual info
      timeLimit: session.timeLimitSeconds,
      difficulty
    });
  } catch (err) {
    console.error('Flipcards start error:', err);
    return res.status(500).json({ success: false, error: 'Failed to start game' });
  }
});

/**
 * POST /api/games/flipcards/move
 * Record a card flip move
 *
 * Body: { gameSessionId, cardIds: [string], clientDuration: number (ms since game start) }
 * Returns: { matched: boolean, matchedTripletId?: string, completionPercent }
 */
router.post('/flipcards/move', apiAuth, async (req, res) => {
  try {
    const { gameSessionId, cardIds, clientDuration } = req.body;

    if (!gameSessionId || !Array.isArray(cardIds)) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Fetch game session
    const session = await GameSession.findById(gameSessionId);
    if (!session || session.telegramId !== req.user) {
      return res.status(404).json({ success: false, error: 'Game session not found' });
    }

    if (session.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Game is no longer active' });
    }

    // Validate move
    const validation = session.validateMove(cardIds);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.reason });
    }

    // Record the move
    session.moves.push({
      cardIds,
      timestamp: new Date(),
      duration: clientDuration
    });
    session.matchAttempts += 1;

    // Check for triplet match
    const matchResult = session.checkTripletMatch(cardIds);

    if (matchResult.matched) {
      // Valid triplet match!
      if (!session.matchedTriplets.includes(matchResult.tripletId)) {
        session.matchedTriplets.push(matchResult.tripletId);
        session.correctMatches += 1;

        // Mark cards as revealed
        cardIds.forEach((cardId) => {
          const card = session.cards.find((c) => c.id === cardId);
          if (card) card.revealed = true;
        });
      }
    } else {
      // Not a match - flip cards back after a delay (handled client-side)
      // Server just records the attempt
    }

    // Calculate completion
    const completionPercent = Math.round(
      (session.matchedTriplets.length / session.totalTriplets) * 100
    );

    // Check if game is completed
    if (session.matchedTriplets.length === session.totalTriplets) {
      session.completedAt = new Date();
      session.timeUsedSeconds = Math.round(
        (session.completedAt - session.startedAt) / 1000
      );

      // Calculate reward
      const reward = session.calculateReward();
      session.reward = {
        ...reward,
        earnedAt: new Date()
      };

      // Detect suspicious activity
      const suspicious = session.detectSuspiciousActivity();
      if (suspicious.suspicious) {
        session.speedAnalysis = {
          avgMoveTime: session.timeUsedSeconds / session.matchAttempts,
          suspiciousPattern: true,
          flagReason: suspicious.reason
        };
        console.warn(
          `[ANTI-CHEAT] Suspicious activity detected for user ${req.user}: ${suspicious.reason}`
        );
      }

      session.status = 'completed';
    }

    await session.save();

    return res.json({
      success: true,
      matched: matchResult.matched,
      matchedTripletId: matchResult.tripletId,
      completionPercent,
      gameComplete: session.status === 'completed',
      reward: session.status === 'completed' ? session.reward : null
    });
  } catch (err) {
    console.error('Flipcards move error:', err);
    return res.status(500).json({ success: false, error: 'Failed to record move' });
  }
});

/**
 * POST /api/games/flipcards/complete
 * Claim reward for completed game (final endpoint)
 *
 * Body: { gameSessionId }
 * Returns: { success, reward, newPoints, newXp }
 */
router.post('/flipcards/complete', apiAuth, async (req, res) => {
  try {
    const { gameSessionId } = req.body;

    if (!gameSessionId) {
      return res.status(400).json({ success: false, error: 'Missing gameSessionId' });
    }

    // Fetch game session
    const session = await GameSession.findById(gameSessionId);
    if (!session || session.telegramId !== req.user) {
      return res.status(404).json({ success: false, error: 'Game session not found' });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Game not completed' });
    }

    if (session.rewardClaimed) {
      return res.status(409).json({ success: false, error: 'Reward already claimed' });
    }

    // Final anti-cheat check
    if (session.speedAnalysis.suspiciousPattern) {
      console.warn(
        `[ANTI-CHEAT] Flagged suspicious game ${gameSessionId} for user ${req.user}`
      );
      // Still allow reward but flag for admin review
      // Could implement: reduced reward multiplier, or require manual review
    }

    // Fetch user and award points
    const user = await User.findOne({ telegramId: req.user });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Award rewards with anti-cheat penalty if flagged
    let pointsAward = session.reward.points;
    let xpAward = session.reward.xp;

    if (session.speedAnalysis.suspiciousPattern) {
      pointsAward = Math.floor(pointsAward * 0.5); // 50% penalty
      xpAward = Math.floor(xpAward * 0.5);
    }

    user.points += pointsAward;
    user.xp += xpAward;
    user.bronzeTickets += session.reward.bronzeTickets;

    // Recalculate level
    const levelUtil = require('../utils/levelUtil');
    user.level = levelUtil.getUserLevel(user.points);

    await user.save();

    // Mark reward as claimed
    session.rewardClaimed = true;
    await session.save();

    return res.json({
      success: true,
      reward: {
        points: pointsAward,
        xp: xpAward,
        bronzeTickets: session.reward.bronzeTickets
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
    });
  } catch (err) {
    console.error('Flipcards complete error:', err);
    return res.status(500).json({ success: false, error: 'Failed to complete game' });
  }
});

/**
 * GET /api/games/flipcards/status/:gameSessionId
 * Check current game status (useful for page reload recovery)
 */
router.get('/flipcards/status/:gameSessionId', apiAuth, async (req, res) => {
  try {
    const { gameSessionId } = req.params;

    const session = await GameSession.findById(gameSessionId);
    if (!session || session.telegramId !== req.user) {
      return res.status(404).json({ success: false, error: 'Game session not found' });
    }

    const clientCards = session.cards.map((card) => ({
      id: card.id,
      symbol: card.symbol,
      revealed: card.revealed
    }));

    const elapsed = Math.round((new Date() - session.startedAt) / 1000);

    return res.json({
      success: true,
      status: session.status,
      cards: clientCards,
      matchedCount: session.matchedTriplets.length,
      totalTriplets: session.totalTriplets,
      timeElapsed: elapsed,
      timeLimit: session.timeLimitSeconds,
      reward: session.status === 'completed' ? session.reward : null
    });
  } catch (err) {
    console.error('Flipcards status error:', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch game status' });
  }
});

/**
 * DELETE /api/games/flipcards/:gameSessionId
 * Abandon a game
 */
router.delete('/flipcards/:gameSessionId', apiAuth, async (req, res) => {
  try {
    const { gameSessionId } = req.params;

    const session = await GameSession.findById(gameSessionId);
    if (!session || session.telegramId !== req.user) {
      return res.status(404).json({ success: false, error: 'Game session not found' });
    }

    if (session.status === 'abandoned' || session.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Game already ended' });
    }

    session.status = 'abandoned';
    await session.save();

    return res.json({ success: true, message: 'Game abandoned' });
  } catch (err) {
    console.error('Flipcards abandon error:', err);
    return res.status(500).json({ success: false, error: 'Failed to abandon game' });
  }
});

module.exports = router;
