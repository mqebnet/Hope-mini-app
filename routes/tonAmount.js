// routes/tonAmount.js
const express = require('express');
const router = express.Router();
const priceHandler = require('../utils/priceHandler');

router.get('/ton-amount', async (req, res) => {
  try {
    // Calculate TON equivalent for 0.3 USDT (or adjust the value as needed)
    const tonEquivalent = await priceHandler.calculateUSDTToTON(0.3);
    res.json({ tonAmount: tonEquivalent });
  } catch (error) {
    console.error("TON Amount Error:", error);
    res.status(500).json({ error: "Failed to fetch TON amount" });
  }
});

module.exports = router;
