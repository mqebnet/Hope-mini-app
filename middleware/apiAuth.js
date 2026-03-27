//middleware/apiAuth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const parsedExistsCacheTtlMs = Number(process.env.API_AUTH_EXISTS_CACHE_TTL_MS);
const USER_EXISTS_CACHE_TTL_MS = Number.isFinite(parsedExistsCacheTtlMs) && parsedExistsCacheTtlMs >= 0
  ? parsedExistsCacheTtlMs
  : 2000;
const USER_EXISTS_CACHE_MAX_SIZE = 5000;
const userExistsCache = new Map();

function pruneExpiredEntries(now) {
  for (const [key, entry] of userExistsCache.entries()) {
    if (!entry || entry.expiresAt <= now) userExistsCache.delete(key);
  }
}

async function userExists(telegramId) {
  if (USER_EXISTS_CACHE_TTL_MS <= 0) {
    return Boolean(await User.exists({ telegramId }));
  }

  const now = Date.now();
  const cached = userExistsCache.get(telegramId);
  if (cached && cached.expiresAt > now) {
    return cached.exists;
  }

  const exists = Boolean(await User.exists({ telegramId }));
  userExistsCache.set(telegramId, {
    exists,
    expiresAt: now + USER_EXISTS_CACHE_TTL_MS
  });

  if (userExistsCache.size > USER_EXISTS_CACHE_MAX_SIZE) {
    pruneExpiredEntries(now);
  }

  return exists;
}

module.exports = async (req, res, next) => {
  const token =
    req.cookies?.jwt ||
    req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const telegramId = Number(decoded?.telegramId);
    if (!Number.isFinite(telegramId)) {
      res.clearCookie('jwt');
      return res.status(401).json({ error: 'Invalid token' });
    }

    const exists = await userExists(telegramId);
    if (!exists) {
      userExistsCache.delete(telegramId);
      res.clearCookie('jwt');
      return res.status(401).json({ error: 'User no longer exists' });
    }

    req.user = { ...decoded, telegramId };
    next();
  } catch {
    res.clearCookie('jwt');
    return res.status(401).json({ error: 'Invalid token' });
  }
};
