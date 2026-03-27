// Global user data cache to prevent redundant API calls
// One fetch at startup, then use cached data everywhere

const CACHE_KEY = 'hope_user_cache';
const CACHE_VERSION = 1;

let cachedUser = null;
let isFetching = false;
let fetchPromise = null;

// Initialize cache from localStorage on module load
function initializeCache() {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (data.version === CACHE_VERSION) {
        cachedUser = data.user;
      } else {
        localStorage.removeItem(CACHE_KEY);
      }
    }
  } catch (err) {
    console.warn('Cache initialization error:', err);
    localStorage.removeItem(CACHE_KEY);
  }
}

// Fetch user data with stale-while-revalidate behavior and deduplication.
export async function fetchUserDataOnce() {
  if (isFetching) return fetchPromise;

  if (cachedUser) {
    _refreshInBackground();
    return cachedUser;
  }

  return _doFetch();
}

function _refreshInBackground() {
  if (isFetching) return;
  _doFetch({ suppressErrors: true });
}

function _doFetch({ suppressErrors = false } = {}) {
  isFetching = true;
  fetchPromise = (async () => {
    try {
      const res = await fetch('/api/user/me', {
        credentials: 'include',
        cache: 'no-store'
      });

      if (res.status === 429) {
        window.showWarningToast?.('Server busy - retrying shortly...');
        throw new Error('RATE_LIMITED');
      }

      if (!res.ok) throw new Error('Failed to fetch user data');

      const data = await res.json();
      const user = data.user || data;
      cachedUser = user;

      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          version: CACHE_VERSION,
          user: user
        }));
      } catch (e) {
        console.warn('localStorage full:', e);
      }

      if (window.onUserDataUpdate) window.onUserDataUpdate(user);
      return user;
    } catch (err) {
      if (suppressErrors) {
        console.warn('Background user refresh failed:', err);
        return cachedUser;
      }
      throw err;
    } finally {
      isFetching = false;
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

// Get cached user without fetching
export function getCachedUser() {
  return cachedUser;
}

// Set user data (e.g., after game completion)
export function setCachedUser(user) {
  if (!user) return;
  cachedUser = user;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      version: CACHE_VERSION,
      user: user
    }));
  } catch (e) {
    console.warn('localStorage full:', e);
  }
}

// Invalidate cache to force refresh
export function invalidateCache() {
  cachedUser = null;
  localStorage.removeItem(CACHE_KEY);
}

// For backward compatibility with existing code that calls fetchUserData
export async function fetchUserData() {
  return fetchUserDataOnce();
}

// Initialize on module load
initializeCache();

