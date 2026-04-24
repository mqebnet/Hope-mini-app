const express = require('express');
const router = express.Router();

// Only active when WALLET_DEBUG=true in .env
// Logs unknown wallet response shapes for diagnosis - never stores user data
router.post('/wallet-response', (req, res) => {
  if (process.env.WALLET_DEBUG !== 'true') {
    return res.status(204).end();
  }
  const { context, shape, ts } = req.body || {};
  console.warn('[WalletDebug] Unknown response shape', {
    context,
    shape,
    ts,
    telegramId: req.user?.telegramId || 'unauthenticated'
  });
  res.status(204).end();
});

module.exports = router;
