// public/utils.js - Global utility functions

/**
 * Simple debounce for button actions
 * Prevents double clicks by disabling button for X ms
 */
export function debounceButton(button, delayMs = 500) {
  if (!button) return false;
  if (button.disabled) return false;
  
  button.disabled = true;
  setTimeout(() => {
    button.disabled = false;
  }, delayMs);
  
  return true;
}

/**
 * Debounce async function calls
 * Only executes once per interval
 */
export function debounce(fn, delayMs = 500) {
  let timeout = null;
  let lastResult = null;
  
  return async function debounced(...args) {
    return new Promise((resolve) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        lastResult = fn.apply(this, args);
        resolve(lastResult);
      }, delayMs);
    });
  };
}

/**
 * Cache game config in localStorage
 * Prevents repeated API calls for static game data
 */
export function cacheGameConfig(gameId, config, ttlMs = 24 * 60 * 60 * 1000) {
  if (!gameId || !config) return;
  
  try {
    const cached = {
      gameId,
      config,
      timestamp: Date.now(),
      ttl: ttlMs
    };
    localStorage.setItem(`gameConfig_${gameId}`, JSON.stringify(cached));
  } catch (e) {
    console.warn('Failed to cache game config:', e);
  }
}

/**
 * Get cached game config (returns null if expired)
 */
export function getCachedGameConfig(gameId) {
  if (!gameId) return null;
  
  try {
    const cached = JSON.parse(localStorage.getItem(`gameConfig_${gameId}`));
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > cached.ttl) {
      localStorage.removeItem(`gameConfig_${gameId}`);
      return null;
    }
    
    return cached.config;
  } catch (e) {
    return null;
  }
}

/**
 * Bootstrap lock to prevent running twice
 * Usage: if (!canBootstrap('home')) return;
 */
const bootstrapLocks = new Set();

export function canBootstrap(lockName) {
  if (bootstrapLocks.has(lockName)) {
    return false;
  }
  bootstrapLocks.add(lockName);
  return true;
}

export function releaseBootstrapLock(lockName) {
  bootstrapLocks.delete(lockName);
}
