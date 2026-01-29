// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const router = express.Router();

function checkSignature(initData) {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken || !initData) return false;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;

  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto
    .createHash('sha256')
    .update(botToken)
    .digest();

  const computed = crypto
    .createHmac('sha256', secret)
    .update(dataCheckString)
    .digest('hex');

  return computed === hash;
}

router.post('/telegram', async (req, res) => {
  try {
    const { initData } = req.body;

    if (!checkSignature(initData)) {
      return res.status(401).json({ success: false, message: 'Invalid Telegram signature' });
    }

    const params = new URLSearchParams(initData);
    const telegramId = params.get('user.id');
    if (!telegramId) {
      return res.status(400).json({ success: false, message: 'User ID missing' });
    }

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        username: params.get('user.username') || `user_${telegramId}`,
        firstName: params.get('user.first_name'),
        lastName: params.get('user.last_name'),
        points: 0,
        xp: 0,
        level: 'Seeker'
      });
    }

    const token = jwt.sign(
      { telegramId: user.telegramId },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.cookie('jwt', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.telegramId,
        points: user.points,
        level: user.level,
        xp: user.xp
      }
    });
  } catch (err) {
    console.error('Telegram auth error:', err);
    res.status(500).json({ success: false, message: 'Auth failed' });
  }
});

module.exports = router;
