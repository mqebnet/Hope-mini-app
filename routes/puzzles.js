// routes/puzzles.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

/**
 * POST /api/puzzles/verify
 * Body:
 * {
 *   puzzleId: String
 * }
 *
 * This endpoint is a future-proof hook.
 * The client handles puzzle mechanics.
 * mysteryBox.js handles rewards.
 *
 * We only record that the puzzle was completed.
 */
router.post('/verify', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { puzzleId } = req.body;

    if (!puzzleId) {
      return res.status(400).json({ error: 'Missing puzzleId' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.completedPuzzles = user.completedPuzzles || [];

    if (!user.completedPuzzles.includes(puzzleId)) {
      user.completedPuzzles.push(puzzleId);
      await user.save();
    }

    res.json({ message: 'Puzzle verified' });
  } catch (error) {
    console.error('Puzzle Verify Error:', error);
    res.status(500).json({ error: 'Puzzle verification failed' });
  }
});

module.exports = router;
