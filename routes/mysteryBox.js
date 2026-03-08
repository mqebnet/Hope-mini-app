const express = require('express');
const router = express.Router();
const { gameEngine, GameEngineError } = require('../services/games');

function handleError(res, err) {
  if (err instanceof GameEngineError) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  console.error('Mystery box route error:', err);
  return res.status(500).json({ error: 'Mystery box request failed' });
}

router.get('/status', async (req, res) => {
  try {
    const result = await gameEngine.invoke('mystery-box', 'getStatus', { user: req.user, req });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/purchase', async (req, res) => {
  try {
    const result = await gameEngine.invoke('mystery-box', 'purchase', { user: req.user, req }, req.body || {});
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/open', async (req, res) => {
  try {
    const result = await gameEngine.invoke('mystery-box', 'claim', { user: req.user, req }, req.body || {});
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;

