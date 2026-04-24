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

let navigationInFlight = false;
let navigationFeedbackBound = false;

export function setButtonLoading(button, options = {}) {
  if (!button) return null;

  const {
    text = null,
    lockWidth = true
  } = options;

  const state = {
    disabled: 'disabled' in button ? Boolean(button.disabled) : null,
    minWidth: button.style?.minWidth || '',
    textContent: text !== null ? button.textContent : null
  };

  if (lockWidth && typeof button.getBoundingClientRect === 'function' && button.style) {
    const width = button.getBoundingClientRect().width;
    if (width > 0) {
      button.style.minWidth = `${Math.ceil(width)}px`;
    }
  }

  button.classList?.add('is-loading');
  button.setAttribute?.('aria-busy', 'true');

  if ('disabled' in button) {
    button.disabled = true;
  } else if (button.style) {
    button.style.pointerEvents = 'none';
  }

  if (text !== null) {
    button.textContent = text;
  }

  return state;
}

export function clearButtonLoading(button, state = null) {
  if (!button) return;

  button.classList?.remove('is-loading');
  button.removeAttribute?.('aria-busy');

  if (state?.disabled !== null && 'disabled' in button) {
    button.disabled = state.disabled;
  } else if (!('disabled' in button) && button.style) {
    button.style.pointerEvents = '';
  }

  if (state?.textContent !== null) {
    button.textContent = state.textContent;
  }

  if (button.style) {
    button.style.minWidth = state?.minWidth || '';
  }
}

function resolveNavigationHref(target) {
  if (!target || typeof window === 'undefined') return '';

  try {
    return new URL(String(target), window.location.href).href;
  } catch (_) {
    return '';
  }
}

export function navigateWithFeedback(target, trigger = null, options = {}) {
  const href = resolveNavigationHref(target);
  if (!href || typeof window === 'undefined') return false;

  const currentHref = window.location.href;
  const reloadIfSame = Boolean(options.reloadIfSame);
  if (href === currentHref && !reloadIfSame) return false;
  if (navigationInFlight) return false;

  navigationInFlight = true;
  document.body?.classList.add('page-transitioning');
  if (trigger) {
    setButtonLoading(trigger, options.button || {});
  }

  const replace = Boolean(options.replace);
  const navigate = () => {
    if (replace) {
      window.location.replace(href);
      return;
    }
    window.location.href = href;
  };

  requestAnimationFrame(() => {
    window.setTimeout(navigate, options.delayMs ?? 70);
  });

  return true;
}

function shouldHandleNavigationClick(event, element) {
  if (!element) return false;
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (element.hasAttribute('download')) return false;

  const href = element.getAttribute('data-loading-href') || element.getAttribute('href');
  if (!href || href.startsWith('#')) return false;

  try {
    const resolved = new URL(href, window.location.href);
    if (resolved.origin !== window.location.origin) return false;
    const reloadIfSame = element.hasAttribute('data-loading-reload');
    if (resolved.href === window.location.href && !reloadIfSame) return false;
  } catch (_) {
    return false;
  }

  return true;
}

export function wireNavigationFeedback(root = document) {
  if (!root || navigationFeedbackBound) return;
  navigationFeedbackBound = true;

  root.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('a.nav-btn[href], a[data-loading-nav][href], button[data-loading-href], a[data-loading-href]');
    if (!shouldHandleNavigationClick(event, trigger)) return;

    event.preventDefault();
    const target = trigger.getAttribute('data-loading-href') || trigger.getAttribute('href');
    navigateWithFeedback(target, trigger, {
      replace: trigger.hasAttribute('data-loading-replace'),
      reloadIfSame: trigger.hasAttribute('data-loading-reload')
    });
  });
}

/**
 * Extract { txHash, txBoc } from a wallet sendTransaction() response.
 *
 * Different wallets (Tonkeeper, OKX, MyTonWallet, Telegram Wallet) return
 * the transaction proof in different shapes. This function exhaustively
 * searches all known paths so callers never have to think about it.
 *
 * Priority:
 *  1. BOC - the canonical TonConnect proof. Backend can derive the tx hash
 *     from it, so a BOC alone is always sufficient for verification.
 *  2. Hash - a shortcut that avoids one BOC-decode step on the backend.
 *     We still collect it when present, but BOC takes precedence.
 *
 * @param {unknown} tx - Raw response from tonConnectUI.sendTransaction()
 * @param {string}  [context=''] - Label for logging (e.g. 'daily-checkin')
 * @returns {{ txHash: string, txBoc: string }}
 */
export function getTxProof(tx, context = '') {
  const label = context ? `[getTxProof:${context}]` : '[getTxProof]';

  if (!tx || typeof tx !== 'object') {
    console.warn(`${label} received non-object response:`, typeof tx);
    return { txHash: '', txBoc: '' };
  }

  // BOC extraction
  const txBoc = (
    tx.boc ||
    tx.result?.boc ||
    tx.payload?.boc ||
    tx.data?.boc ||
    tx.transaction?.boc ||
    tx.response?.boc ||
    ''
  );

  // Hash extraction
  const txHash = (
    tx.transaction?.hash ||
    tx.txid?.hash ||
    tx.hash ||
    tx.result?.hash ||
    tx.tx_hash ||
    tx.txHash ||
    tx.transaction_hash ||
    ''
  );

  if (!txBoc && !txHash) {
    const safeShape = JSON.stringify(
      Object.fromEntries(
        Object.keys(tx).map((k) => [
          k,
          typeof tx[k] === 'string'
            ? `<string(${tx[k].length})>`
            : typeof tx[k]
        ])
      )
    );
    console.warn(`${label} Could not extract txHash or txBoc. Response shape:`, safeShape);

    try {
      fetch('/api/debug/wallet-response', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, shape: safeShape, ts: Date.now() })
      }).catch(() => {});
    } catch (_) {}
  }

  return { txHash, txBoc };
}
