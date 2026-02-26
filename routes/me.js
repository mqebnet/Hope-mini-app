// routes/me.js
const express = require('express');

const router = express.Router();

router.get('/', async (req, res) => {
  res.json({ authenticated: true });
});

module.exports = router;
