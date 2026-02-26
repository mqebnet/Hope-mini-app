// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

const router = express.Router();
const TELEGRAM_AUTH_MAX_AGE_SEC = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SEC || 86400);
const TELEGRAM_FUTURE_SKEW_SEC = Number(process.env.TELEGRAM_FUTURE_SKEW_SEC || 300);

function parseAndValidateInitData(initData) {
  if (typeof initData !== 'string' || !initData.trim()) {
    return { ok: false, code: 400, message: 'initData missing' };
  }

  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    return { ok: false, code: 500, message: 'Server auth config missing' };
  }

  let params;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, code: 400, message: 'Invalid initData format' };
  }

  const hash = params.get('hash');
  if (!hash) {
    return { ok: false, code: 403, message: 'Invalid Telegram data' };
  }

  const authDateStr = params.get('auth_date');
  const authDate = Number(authDateStr);
  if (!Number.isFinite(authDate)) {
    return { ok: false, code: 403, message: 'Invalid Telegram data' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const ageSec = nowSec - authDate;
  if (ageSec > TELEGRAM_AUTH_MAX_AGE_SEC) {
    return { ok: false, code: 403, message: 'Telegram auth data expired' };
  }

  const futureSec = authDate - nowSec;
  if (futureSec > TELEGRAM_FUTURE_SKEW_SEC && process.env.NODE_ENV === 'production') {
    return { ok: false, code: 403, message: 'Telegram auth data invalid (clock skew)' };
  }

  params.delete('hash');

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const hashBuf = Buffer.from(hash, 'hex');
  const computedBuf = Buffer.from(computedHash, 'hex');
  const validHash =
    hashBuf.length === computedBuf.length &&
    crypto.timingSafeEqual(hashBuf, computedBuf);

  if (process.env.NODE_ENV !== 'production') {
    console.log('AUTH DATE:', authDate, 'NOW:', nowSec, 'AGE:', ageSec, 'FUTURE:', futureSec);
    console.log('RECEIVED HASH:', hash);
    console.log('CALCULATED HASH:', computedHash);
  }

  if (!validHash) {
    return { ok: false, code: 403, message: 'Invalid Telegram data' };
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    return { ok: false, code: 400, message: 'User missing' };
  }

  let tgUser;
  try {
    tgUser = JSON.parse(userRaw);
  } catch {
    return { ok: false, code: 400, message: 'Invalid Telegram user payload' };
  }

  const telegramId = Number(tgUser.id);
  if (!Number.isFinite(telegramId)) {
    return { ok: false, code: 400, message: 'Invalid Telegram user id' };
  }

  return {
    ok: true,
    telegramId,
    username: tgUser.username || `user_${telegramId}`
  };
}

router.post('/telegram', async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: 'Server auth config missing' });
    }

    const parsed = parseAndValidateInitData(req.body?.initData);
    if (!parsed.ok) {
      return res.status(parsed.code).json({ success: false, message: parsed.message });
    }

    const { telegramId, username } = parsed;

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        username,
        points: 0,
        xp: 0,
        streak: 0,
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

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('jwt', token, {
      httpOnly: true,
      sameSite: isProduction ? 'strict' : 'lax',
      secure: isProduction,
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
    console.error('Telegram auth error:', err.stack);
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'Duplicate user error - try logging in' });
    }
    res.status(500).json({ success: false, message: 'Auth failed' });
  }
});

router.post('/debug-log', (req, res) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('DEBUG FROM MINI APP:', req.body);
  }
  res.sendStatus(200);
});

module.exports = router;
