// routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Referral = require('../models/Referral');
const UserBadge = require('../models/UserBadge');
const { generateUniqueInviteCode } = require('../utils/inviteCode');
const { getUserLevel } = require('../utils/levelUtil');

const router = express.Router();
const TELEGRAM_AUTH_MAX_AGE_SEC = Number(process.env.TELEGRAM_AUTH_MAX_AGE_SEC || 86400);
const TELEGRAM_FUTURE_SKEW_SEC = Number(process.env.TELEGRAM_FUTURE_SKEW_SEC || 300);
const INVITE_JOIN_BONUS_POINTS = 100;

function getAdminIds() {
  return new Set(
    (process.env.ADMIN_TELEGRAM_IDS || '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v))
  );
}

function getCookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const viaHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const explicitSameSite = (process.env.COOKIE_SAMESITE || '').toLowerCase();

  let sameSite;
  if (explicitSameSite === 'none' || explicitSameSite === 'lax' || explicitSameSite === 'strict') {
    sameSite = explicitSameSite;
  } else if (viaHttps) {
    // Telegram WebView commonly needs SameSite=None for cookie round-trips.
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
  const startParamRaw = params.get('start_param') || params.get('startapp') || params.get('start');
  const startParam = typeof startParamRaw === 'string' ? startParamRaw.trim() : '';

  return {
    ok: true,
    telegramId,
    username: tgUser.username || `user_${telegramId}`,
    startParam
  };
}

function parseInviteCandidates(startParam) {
  if (!startParam || typeof startParam !== 'string') return [];
  const raw = startParam.trim();
  if (!raw) return [];

  const candidates = new Set([raw]);

  // common formats: "ref_<code>", "<telegramId>_<code>", "<telegramId>"
  const parts = raw.split(/[_:|-]/).filter(Boolean);
  for (const part of parts) candidates.add(part);

  // If token starts with numeric inviter id and has suffix, preserve id candidate.
  const leadingNumeric = raw.match(/^(\d{5,})/);
  if (leadingNumeric?.[1]) candidates.add(leadingNumeric[1]);

  return Array.from(candidates);
}

async function resolveInviterFromStartParam(startParam, currentTelegramId) {
  const candidates = parseInviteCandidates(startParam);
  if (!candidates.length) return null;

  // 1) Prefer inviteCode matches
  let inviter = await User.findOne({ inviteCode: { $in: candidates } });

  // 2) Fallback to numeric telegramId matches
  if (!inviter) {
    const numericCandidates = candidates
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    if (numericCandidates.length) {
      inviter = await User.findOne({ telegramId: { $in: numericCandidates } });
    }
  }

  if (!inviter) return null;
  if (Number(inviter.telegramId) === Number(currentTelegramId)) return null; // self-referral block
  return inviter;
}

async function applyReferralAttribution(user, startParam) {
  if (!user || user.invitedBy || !startParam) return { applied: false, reason: 'skip' };

  const inviter = await resolveInviterFromStartParam(startParam, user.telegramId);
  if (!inviter) return { applied: false, reason: 'inviter-not-found' };

  user.invitedBy = inviter.telegramId;
  user.points = (user.points || 0) + INVITE_JOIN_BONUS_POINTS;
  user.level = getUserLevel(user.points);
  await user.save();

  const referralResult = await Referral.updateOne(
    { invitedId: user.telegramId },
    {
      $setOnInsert: {
        inviterId: inviter.telegramId,
        invitedId: user.telegramId,
        joinedAt: new Date()
      }
    },
    { upsert: true }
  );
  const inserted = Number(referralResult?.upsertedCount || 0) > 0;
  if (inserted) {
    await User.updateOne(
      { telegramId: inviter.telegramId },
      { $inc: { invitedCount: 1 } }
    );
  }

  return {
    applied: true,
    inviterTelegramId: inviter.telegramId,
    inviterUpdated: inserted ? 1 : 0
  };
}

async function ensureInviterReferralBackfill(user) {
  if (!user?.invitedBy) return { synced: false, reason: 'no-inviter' };
  if (Number(user.invitedBy) === Number(user.telegramId)) return { synced: false, reason: 'self-referral' };

  const referralResult = await Referral.updateOne(
    { invitedId: user.telegramId },
    {
      $setOnInsert: {
        inviterId: Number(user.invitedBy),
        invitedId: user.telegramId,
        joinedAt: user.createdAt || new Date()
      }
    },
    { upsert: true }
  );
  const inserted = Number(referralResult?.upsertedCount || 0) > 0;
  if (inserted) {
    await User.updateOne(
      { telegramId: Number(user.invitedBy) },
      { $inc: { invitedCount: 1 } }
    );
  }

  return {
    synced: inserted,
    inviterUpdated: inserted ? 1 : 0
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

    const fallbackStartParamRaw = typeof req.body?.startParam === 'string' ? req.body.startParam : '';
    const fallbackStartParam = fallbackStartParamRaw.trim();
    const startParam = parsed.startParam || fallbackStartParam;
    const { telegramId, username } = parsed;
    const isAdmin = getAdminIds().has(telegramId);

    let user = await User.findOne({ telegramId });
    if (!user) {
      user = new User({
        telegramId,
        username,
        isAdmin,
        points: 0,
        xp: 0,
        streak: 0,
        level: 'Seeker',
        bronzeTickets: 0,
        silverTickets: 0,
        goldTickets: 0
      });
      // assign a unique invite code before saving
      user.inviteCode = await generateUniqueInviteCode();
      await user.save();
    } else if (!user.inviteCode) {
      // retroactively fill missing codes for existing accounts
      user.inviteCode = await generateUniqueInviteCode();
      await user.save();
    } else if (user.isAdmin !== isAdmin) {
      user.isAdmin = isAdmin;
      await user.save();
    }

    // Apply referral attribution whenever user has no inviter yet and deep-link param exists.
    if (!user.invitedBy && startParam) {
      const referralResult = await applyReferralAttribution(user, startParam);
      if (process.env.NODE_ENV !== 'production') {
        console.log('Referral attribution result:', {
          startParam,
          telegramId: user.telegramId,
          ...referralResult
        });
      }
    }

    // Safety net for legacy/partial records:
    // if invitedBy exists but inviter counters/array were never updated, backfill once.
    if (user.invitedBy) {
      const backfillResult = await ensureInviterReferralBackfill(user);
      if (process.env.NODE_ENV !== 'production' && backfillResult.synced) {
        console.log('Referral backfill result:', {
          telegramId: user.telegramId,
          invitedBy: user.invitedBy,
          ...backfillResult
        });
      }
    }

    const token = jwt.sign(
      { telegramId: user.telegramId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('jwt', token, getCookieOptions(req));
    const badgeDocs = await UserBadge.find(
      { telegramId: user.telegramId },
      { badge: 1, _id: 0 }
    ).lean();
    const badges = badgeDocs.map((row) => row.badge);

    res.json({
      success: true,
      user: {
        id: user.telegramId,
        username: user.username,
        level: user.level,
        xp: user.xp,
        streak: user.streak,
        isAdmin: user.isAdmin,
        points: user.points,
        badges,
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
