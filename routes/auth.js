// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const router = express.Router();

/* ============================
   TELEGRAM SIGNATURE CHECK
============================ */
function checkSignature(initData) {
  const botToken = process.env.BOT_TOKEN;
  if (!botToken || !initData) return false;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return false;

  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHash('sha256')
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return computedHash === hash;
}

/* ============================
   MINI APP AUTH
============================ */
router.post('/telegram', async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) {
      return res.status(400).json({ success: false, message: 'initData missing' });
    }

    if (!checkSignature(initData)) {
      return res.status(403).json({ success: false, message: 'Invalid Telegram data' });
    }

    const params = new URLSearchParams(initData);
    const userRaw = params.get('user');
    if (!userRaw) {
      return res.status(400).json({ success: false, message: 'User missing' });
    }

    const tgUser = JSON.parse(userRaw);
    const telegramId = tgUser.id;

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        username: tgUser.username || `user_${telegramId}`,
        points: 0,
        xp: 0,
        level: 'Seeker'
      });
    }

    const token = jwt.sign(
      { telegramId: user.telegramId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('jwt', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({
      success: true,
      user: {
        id: user.telegramId,
        level: user.level,
        xp: user.xp,
        points: user.points
      }
    });
  } catch (err) {
    console.error('Telegram auth error:', err);
    res.status(500).json({ success: false, message: 'Auth failed' });
  }
});

module.exports = router;
