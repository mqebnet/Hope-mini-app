// routes/test-login.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

function getCookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const viaHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const explicitSameSite = (process.env.COOKIE_SAMESITE || '').toLowerCase();

  let sameSite;
  if (explicitSameSite === 'none' || explicitSameSite === 'lax' || explicitSameSite === 'strict') {
    sameSite = explicitSameSite;
  } else if (viaHttps) {
    sameSite = 'none';
  } else {
    sameSite = isProd ? 'strict' : 'lax';
  }

  const secure = sameSite === 'none' ? true : (isProd || viaHttps);

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: '/'
  };
}

router.post('/', async (req, res) => {
  const telegramId = 1002;

  let user = await User.findOne({ telegramId });
  if (!user) {
    user = await User.create({
      telegramId,
      username: 'test_user',
      points: 10000,
      xp: 10,
      level: 'Seeker'
    });
  }

  const token = jwt.sign(
    { telegramId: user.telegramId },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  res.cookie('jwt', token, getCookieOptions(req));

  res.json({ token, userId: telegramId });
});

module.exports = router;

