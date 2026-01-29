const express = require('express');
const router = express.Router();
const { connector } = require('../tonHandler');

// Get connection link
router.get('/connect', async (req, res) => {
  try {
    const connectUrl = await connector.connect();
    res.json({ url: connectUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get connection status
router.get('/status', async (req, res) => {
  try {
    const status = await connector.getConnection();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;