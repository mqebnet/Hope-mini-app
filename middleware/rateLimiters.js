const rateLimit = require('express-rate-limit');

// 1) authLimiter - strict, for login/auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many auth attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// 2) gameLimiter - generous, keyed by telegramId (not IP)
// Telegram Mini Apps can share IPs across users on mobile networks.
const gameLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 5000,
  message: { success: false, error: 'Too many game requests, please slow down' },
  keyGenerator: (req) => req.user?.telegramId?.toString() || req.ip,
  standardHeaders: true,
  legacyHeaders: false
});

// 3) generalLimiter - fallback for all other /api/ routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  keyGenerator: (req) => req.user?.telegramId?.toString() || req.ip,
  message: { success: false, error: 'Too many requests, please try again later' },
  skip: (req) => {
    // Skip for game routes (they have their own generous limiter)
    if (req.path.startsWith('/games/')) return true;

    // Skip for exempt IPs (dev/testing)
    const exemptIps = String(process.env.RATE_LIMIT_EXEMPT_IPS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    return exemptIps.includes(req.ip);
  },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = { authLimiter, gameLimiter, generalLimiter };
