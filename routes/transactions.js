// routes/transactions.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');

/**
 * POST /api/transactions
 * Body:
 * {
 *   txHash: String,
 *   purpose: "daily-checkin" | "mystery-box" | "ticket-exchange",
 *   expectedUsd: Number
 * }
 *
 * This endpoint ONLY records intent + txHash.
 * Verification is handled later by tonHandler.js
 */
router.post('/', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { txHash, purpose, expectedUsd } = req.body;

    if (!txHash || !purpose || typeof expectedUsd !== 'number') {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.transactions = user.transactions || [];

    const exists = user.transactions.some(tx => tx.txHash === txHash);
    if (exists) {
      return res.status(400).json({ error: 'Transaction already recorded' });
    }

    user.transactions.push({
      txHash,
      purpose,
      expectedUsd,
      status: 'pending',
      createdAt: new Date()
    });

    await user.save();

    res.json({
      success: true,
      message: 'Transaction recorded and pending verification'
    });

  } catch (error) {
    console.error('Transaction store error:', error);
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

/**
 * GET /api/transactions
 * Returns current user's transaction history
 */
router.get('/', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;

    const user = await User.findOne(
      { telegramId },
      { transactions: 1 }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ transactions: user.transactions || [] });
  } catch (error) {
    console.error('Fetch transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
