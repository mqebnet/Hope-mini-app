const express = require('express');
const router = express.Router();
const { gameEngine, GameEngineError } = require('../services/games');

function handleError(res, err) {
  if (err instanceof GameEngineError) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  console.error('Boxes route error:', err);
  return res.status(500).json({ error: 'Box request failed' });
}

router.post('/open', async (req, res) => {
  try {
    const result = await gameEngine.invoke('mystery-box', 'claim', { user: req.user, req }, req.body || {});
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;
