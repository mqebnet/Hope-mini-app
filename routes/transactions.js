// routes/transactions.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Transaction = require('../models/Transaction');

/**
 * POST /api/transactions
 * Body:
 * {
 *   txHash: String,
 *   purpose: String,
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

    const userExists = await User.exists({ telegramId });
    if (!userExists) return res.status(404).json({ error: 'User not found' });

    const exists = await Transaction.exists({ txHash });
    if (exists) {
      return res.status(400).json({ error: 'Transaction already recorded' });
    }

    await Transaction.create({
      telegramId,
      txHash,
      purpose,
      expectedUsd,
      status: 'pending',
      createdAt: new Date()
    });

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

    const userExists = await User.exists({ telegramId });
    if (!userExists) return res.status(404).json({ error: 'User not found' });

    const transactions = await Transaction.find({ telegramId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ transactions });
  } catch (error) {
    console.error('Fetch transactions error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

module.exports = router;
