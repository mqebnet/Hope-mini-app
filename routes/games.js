const express = require('express');
const router = express.Router();
const { gameEngine, GameEngineError } = require('../services/games');

function handleError(res, err) {
  if (err instanceof GameEngineError) {
    return res.status(err.status || 400).json({ success: false, error: err.message });
  }
  console.error('Games route error:', err);
  return res.status(500).json({ success: false, error: 'Game request failed' });
}

async function invoke(res, gameId, method, req, payload = {}) {
  const result = await gameEngine.invoke(gameId, method, { user: req.user, req }, payload);
  return res.json(result);
}

// Unified catalog for plug-and-play frontend rendering.
router.get('/catalog', (req, res) => {
  try {
    return res.json({ success: true, games: gameEngine.getCatalog() });
  } catch (err) {
    return handleError(res, err);
  }
});

// Generic game endpoints.
router.post('/:gameId/start', async (req, res) => {
  try {
    return await invoke(res, req.params.gameId, 'start', req, req.body || {});
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/:gameId/move', async (req, res) => {
  try {
    return await invoke(res, req.params.gameId, 'move', req, req.body || {});
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/:gameId/complete', async (req, res) => {
  try {
    return await invoke(res, req.params.gameId, 'complete', req, req.body || {});
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/:gameId/claim', async (req, res) => {
  try {
    return await invoke(res, req.params.gameId, 'claim', req, req.body || {});
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/:gameId/purchase', async (req, res) => {
  try {
    return await invoke(res, req.params.gameId, 'purchase', req, req.body || {});
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/:gameId/status', async (req, res) => {
  try {
    return await invoke(res, req.params.gameId, 'getStatus', req, {});
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/:gameId/session/:gameSessionId', async (req, res) => {
  try {
    return await invoke(res, req.params.gameId, 'getSession', req, { gameSessionId: req.params.gameSessionId });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete('/:gameId/session/:gameSessionId', async (req, res) => {
  try {
    return await invoke(res, req.params.gameId, 'abandon', req, { gameSessionId: req.params.gameSessionId });
  } catch (err) {
    return handleError(res, err);
  }
});

// Legacy flipcards endpoints kept for existing frontend compatibility.
router.post('/flipcards/start', async (req, res) => {
  try {
    return await invoke(res, 'flipcards', 'start', req, req.body || {});
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/flipcards/move', async (req, res) => {
  try {
    return await invoke(res, 'flipcards', 'move', req, req.body || {});
  } catch (err) {
    return handleError(res, err);
  }
});

router.post('/flipcards/complete', async (req, res) => {
  try {
    return await invoke(res, 'flipcards', 'complete', req, req.body || {});
  } catch (err) {
    return handleError(res, err);
  }
});

router.get('/flipcards/status/:gameSessionId', async (req, res) => {
  try {
    return await invoke(res, 'flipcards', 'getSession', req, { gameSessionId: req.params.gameSessionId });
  } catch (err) {
    return handleError(res, err);
  }
});

router.delete('/flipcards/:gameSessionId', async (req, res) => {
  try {
    return await invoke(res, 'flipcards', 'abandon', req, { gameSessionId: req.params.gameSessionId });
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = router;

