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

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return false;

    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // Fixed secret_key per Telegram docs: HMAC_SHA256(botToken, key="WebAppData")
    const secretKey = crypto.createHmac('sha256', "WebAppData")
      .update(botToken)
      .digest();

    const computedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    console.log('BOT TOKEN USED:', botToken.substring(0, 5) + '...'); // Masked for security
    console.log('DATA CHECK STRING:', dataCheckString);
    console.log('RECEIVED HASH:', hash);
    console.log('CALCULATED HASH:', computedHash);

    return computedHash === hash;
  } catch (err) {
    console.error('Signature check error:', err);
    return false;
  }
}

/* ============================
   MINI APP AUTH
============================ */
router.post('/telegram', async (req, res) => {
  console.log('📥 AUTH BODY:', req.body);
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
        userId: telegramId, // Set userId to avoid null duplicate
        telegramId,
        username: tgUser.username || `user_${telegramId}`,
        points: 0,
        xp: 0,
        streak : 0,
        level: 'Seeker',
        bronzeTickets: 0,
        silverTickets: 0,   
        goldTickets: 0
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
      secure: process.env.NODE_ENV === 'production' || false, // Allow insecure for local/ngrok testing
      path: '/'
    });

    res.json({
      success: true,
      user: {
        id: user.telegramId,
        username: user.username,
        level: user.level,
        xp: user.xp,
        streak: user.streak,
        points: user.points,
        bronzeTickets: user.bronzeTickets,
        silverTickets: user.silverTickets,
       goldTickets: user.goldTickets
      }
    });
  } catch (err) {
    console.error('Telegram auth error:', err.stack); // Detailed log
    if (err.code === 11000) { // Duplicate key
      return res.status(400).json({ success: false, message: 'Duplicate user error - try logging in' });
    }
    res.status(500).json({ success: false, message: 'Auth failed' });
  }
});

router.post('/debug-log', (req, res) => {
  console.log('📩 DEBUG FROM MINI APP:', req.body);
  res.sendStatus(200);
});

module.exports = router;