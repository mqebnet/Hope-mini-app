// routes/tonAmount.js
const express = require('express');
const router = express.Router();
const priceHandler = require('../utils/priceHandler');

router.get('/ton-amount', async (req, res) => {
  try {
    const tonEquivalent = await priceHandler.usdtToTon(0.3, { allowStale: true });
    const recipientAddress = process.env.DEV_WALLET_ADDRESS || '';
    res.json({ tonAmount: tonEquivalent, recipientAddress });
  } catch (error) {
    console.error('TON Amount Error:', error);
    res.status(503).json({ error: 'TON pricing temporarily unavailable' });
  }
});

module.exports = router;
