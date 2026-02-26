// routes/test-login.js
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

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

  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('jwt', token, {
    httpOnly: true,
    sameSite: isProduction ? 'strict' : 'lax',
    secure: isProduction,
    path: '/'
  });

  res.json({ token, userId: telegramId });
});

module.exports = router;
