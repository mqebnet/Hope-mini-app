const { rateLimit, MemoryStore } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { createClient } = require('redis');

// Redis-backed rate limiting with graceful fallback.
// We intentionally fail open here: if Redis is unavailable, requests should
// continue rather than taking the whole app down.

let rlRedisClient = null;
let redisStoreReady = false;

const rlRedis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) return false;
      return Math.min(retries * 200, 3000);
    }
  }
});

rlRedis.on('ready', () => {
  rlRedisClient = rlRedis;
  redisStoreReady = true;
  console.log('[RateLimit] Redis store ready');
});

rlRedis.on('reconnecting', () => {
  if (redisStoreReady) {
    console.warn('[RateLimit] Redis reconnecting — temporarily using in-memory store');
  }
  rlRedisClient = null;
  redisStoreReady = false;
});

rlRedis.on('end', () => {
  if (redisStoreReady) {
    console.warn('[RateLimit] Redis connection closed — using in-memory store');
  }
  rlRedisClient = null;
  redisStoreReady = false;
});

rlRedis.on('error', (err) => {
  if (redisStoreReady) {
    console.error('[RateLimit] Redis error:', err.message);
  }
});

rlRedis.connect().catch(() => {
  console.warn('[RateLimit] Redis unavailable — using in-memory store (not safe for multi-process)');
});

class HybridRateLimitStore {
  constructor(prefix) {
    this.prefix = `rl:${prefix}:`;
    this.memoryStore = new MemoryStore();
    this.redisStore = null;
    this.options = null;
  }

  init(options) {
    this.options = options;
    if (typeof this.memoryStore.init === 'function') {
      this.memoryStore.init(options);
    }
    this.ensureRedisStore();
  }

  ensureRedisStore() {
    if (!redisStoreReady || !rlRedisClient) {
      return null;
    }
    if (!this.redisStore) {
      this.redisStore = new RedisStore({
        sendCommand: (...args) => rlRedisClient.sendCommand(args),
        prefix: this.prefix
      });
      if (this.options && typeof this.redisStore.init === 'function') {
        this.redisStore.init(this.options);
      }
    }
    return this.redisStore;
  }

  getActiveStore() {
    return this.ensureRedisStore() || this.memoryStore;
  }

  async increment(key) {
    return this.getActiveStore().increment(key);
  }

  async decrement(key) {
    return this.getActiveStore().decrement(key);
  }

  async resetKey(key) {
    return this.getActiveStore().resetKey(key);
  }

  async get(key) {
    const store = this.getActiveStore();
    if (typeof store.get === 'function') {
      return store.get(key);
    }
    return undefined;
  }
}

function makeStore(prefix) {
  return new HybridRateLimitStore(prefix);
}

const loggedIpChecks = new Set();

function normalizeIp(ip) {
  const value = String(ip || '').trim().toLowerCase();
  if (!value) return '';
  if (value.startsWith('::ffff:')) {
    return value.slice('::ffff:'.length);
  }
  return value;
}

function isExemptIp(req) {
  const exemptIps = String(process.env.RATE_LIMIT_EXEMPT_IPS || '')
    .split(',')
    .map((v) => normalizeIp(v))
    .filter(Boolean);

  const rawIp = String(req.ip || '').trim();
  const normalizedIp = normalizeIp(rawIp);
  const forwardedFor = String(req.headers?.['x-forwarded-for'] || '').trim();
  const normalizedForwardedIps = forwardedFor
    .split(',')
    .map((value) => normalizeIp(value))
    .filter(Boolean);

  const candidates = Array.from(
    new Set([normalizedIp, ...normalizedForwardedIps].filter(Boolean))
  );

  const exempt = candidates.some((candidate) => exemptIps.includes(candidate));

  if (process.env.NODE_ENV !== 'production') {
    const signature = JSON.stringify({
      rawIp,
      forwardedFor,
      candidates,
      exempt
    });
    if (!loggedIpChecks.has(signature)) {
      loggedIpChecks.add(signature);
      console.log('[RateLimit] IP exemption check', {
        rawIp,
        forwardedFor: forwardedFor || '(none)',
        candidates,
        exemptIps,
        exempt
      });
    }
  }

  return exempt;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  store: makeStore('auth'),
  message: { success: false, error: 'Too many auth attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true
});

const gameLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 500 : 5000,
  store: makeStore('game'),
  keyGenerator: (req) => req.user?.telegramId?.toString() || req.ip,
  skip: isExemptIp,
  message: { success: false, error: 'Too many game requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  store: makeStore('general'),
  keyGenerator: (req) => req.user?.telegramId?.toString() || req.ip,
  skip: (req) => {
    if (req.path.startsWith('/games/')) return true;
    return isExemptIp(req);
  },
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true
});

const miningLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 50,
  store: makeStore('mining'),
  keyGenerator: (req) => req.user?.telegramId?.toString() || req.ip,
  skip: isExemptIp,
  message: { success: false, error: 'Too many mining requests, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
  passOnStoreError: true
});

module.exports = { authLimiter, gameLimiter, generalLimiter, miningLimiter };

