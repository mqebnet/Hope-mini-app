/**
 * CooldownService
 * Tracks per-user, per-action cooldowns in memory.
 * Designed for game move throttling - lightweight alternative to rate limiting
 * for high-frequency, already-authenticated game interactions.
 */
class CooldownService {
  constructor() {
    this.store = new Map(); // key: `${telegramId}:${action}` -> lastUsedAt (ms timestamp)
    // Auto-clean every 5 minutes to prevent memory leaks
    setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if a user is allowed to perform an action.
   * @param {number|string} telegramId
   * @param {string} action - e.g. 'game:move', 'game:start'
   * @param {number} cooldownMs - minimum ms between calls
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  check(telegramId, action, cooldownMs) {
    const key = `${telegramId}:${action}`;
    const lastUsed = this.store.get(key) || 0;
    const now = Date.now();
    const elapsed = now - lastUsed;

    if (elapsed < cooldownMs) {
      return { allowed: false, retryAfterMs: cooldownMs - elapsed };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  /**
   * Record that a user performed an action now.
   * Call this AFTER a successful action, not before.
   */
  record(telegramId, action) {
    const key = `${telegramId}:${action}`;
    this.store.set(key, Date.now());
  }

  /**
   * Check and record atomically.
   * Returns { allowed, retryAfterMs }. Records timestamp only if allowed.
   */
  consume(telegramId, action, cooldownMs) {
    const result = this.check(telegramId, action, cooldownMs);
    if (result.allowed) {
      this.record(telegramId, action);
    }
    return result;
  }

  /**
   * Clear a user's cooldown for an action (e.g., on game complete/abandon).
   */
  clear(telegramId, action) {
    this.store.delete(`${telegramId}:${action}`);
  }

  /**
   * Remove expired entries (older than 10 minutes) to prevent unbounded growth.
   */
  _cleanup() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000;
    for (const [key, timestamp] of this.store.entries()) {
      if (now - timestamp > maxAge) {
        this.store.delete(key);
      }
    }
  }
}

// Export singleton - shared across all routes in the same process
module.exports = new CooldownService();
