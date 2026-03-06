// routes/tonAmount.js
const express = require('express');
const router = express.Router();
const priceHandler = require('../utils/priceHandler');

router.get('/ton-amount', async (req, res) => {
  try {
    const usd = Number.parseFloat(req.query.usd);
    const targetUsd = Number.isFinite(usd) && usd > 0 ? usd : 0.3;
    const tonEquivalent = await priceHandler.usdtToTon(targetUsd, { allowStale: true });
    const recipientAddress = process.env.DEV_WALLET_ADDRESS || process.env.TON_WALLET_ADDRESS || '';
    res.json({ tonAmount: tonEquivalent, recipientAddress, usd: targetUsd });
  } catch (error) {
    console.error('TON Amount Error:', error);
    res.status(503).json({ error: 'TON pricing temporarily unavailable' });
  }
});

module.exports = router;
