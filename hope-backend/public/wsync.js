// WebSocket Sync Manager (wsync.js)
// Real-time user data synchronization without polling
// Reduces backend requests by ~90% by pushing updates instead of fetching
// Falls back to polling (every 30s) if WebSocket unavailable

import { setCachedUser, getCachedUser, setWsActive } from './userData.js';

let socket = null;
let isConnected = false;
let pollInterval = null;
const POLL_INTERVAL_MS = 30000; // 30 seconds fallback polling

function emitConnectionStatus(trigger = 'unknown') {
  if (typeof window === 'undefined') return;
  const detail = {
    trigger,
    wsConnected: isConnected,
    socketId: socket?.id || null,
    transportName: socket?.io?.engine?.transport?.name || 'unknown',
    pollingActive: Boolean(pollInterval)
  };
  window.dispatchEvent(new CustomEvent('hope:wsync-status', { detail }));
}

/**
 * Initialize WebSocket connection
 * Called after successful authentication in script.js
 * Socket.IO will automatically send httpOnly cookies with the connection
 */
export function initializeWebSocketSync() {
  if (!window.io) {
    console.warn('[WSync] socket.io library not loaded, skipping WebSocket init');
    startPollingFallback();
    emitConnectionStatus('io-missing');
    return;
  }

  // Small delay to ensure all page modules are loaded (home.js, etc.)
  setTimeout(() => {
    _connectWebSocket();
  }, 100);
}

function _connectWebSocket() {
  try {
    // Create socket.io connection
    // Socket.IO will automatically send httpOnly cookies with credentials: 'include'
    socket = window.io(window.location.origin, {
      // The JWT is in an httpOnly cookie, so it's sent automatically
      // No need to pass it in auth parameter
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'], // Fallback to polling if WS unavailable
      withCredentials: true  // Send cookies with the connection
    });

    socket.on('connect', () => {
      console.log('[WSync] Connected to WebSocket server');
      isConnected = true;
      setWsActive(true);  // suppress background HTTP refresh
      
      // Stop polling when WebSocket is active
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }

      // Subscribe to leaderboard updates if user is viewing leaderboard
      const currentTab = document.querySelector('[data-tab].active')?.getAttribute('data-tab');
      if (currentTab === 'leaderboard') {
        const levelIndex = window.currentLeaderboardLevel || 1;
        socket.emit('subscribe:leaderboard', levelIndex);
      }
      emitConnectionStatus('connect');
    });

    socket.on('disconnect', () => {
      console.warn('[WSync] Disconnected from WebSocket server, falling back to polling');
      isConnected = false;
      setWsActive(false);  // re-enable HTTP refresh as fallback
      startPollingFallback();
      emitConnectionStatus('disconnect');
    });

    socket.on('connect_error', (error) => {
      console.warn('[WSync] Connection error:', error.message);
      isConnected = false;
      setWsActive(false);
      startPollingFallback();
      emitConnectionStatus('connect_error');
    });

    // Listen for real-time user balance updates
    // These are broadcast by backend when user state changes (mining, tasks, check-in, etc.)
    socket.on('user:updated', (userData) => {
      console.log('[WSync] Received user update:', userData.points, 'points,', userData.xp, 'xp');
      
      // Update cache - merge with existing cached user if available
      const cachedUser = getCachedUser();
      const updated = cachedUser ? { ...cachedUser, ...userData } : userData;
      
      // Save to cache
      setCachedUser(updated);

      // Trigger UI update with merged data
      if (window.onUserDataUpdate) {
        window.onUserDataUpdate(updated);
        console.log('[WSync] User data update triggered on UI');
      } else {
        console.warn('[WSync] window.onUserDataUpdate not available yet');
      }
    });

    // Listen for leaderboard level updates from other players
    socket.on('leaderboard:updated', (data) => {
      console.log('[WSync] Leaderboard level ' + data.levelIndex + ' updated, refreshing...');
      
      // Only refresh if we're viewing that level
      if (window.currentLeaderboardLevel === data.levelIndex && window.refreshLeaderboard) {
        window.refreshLeaderboard();
      }
    });

    // Global events (contests, special events)
    socket.on('global:event', (data) => {
      console.log('[WSync] Global event:', data.type);
      
      if (window.onGlobalEvent) {
        window.onGlobalEvent(data);
      }
    });

    console.log('[WSync] WebSocket sync initialized');
    emitConnectionStatus('init');
  } catch (err) {
    console.error('[WSync] Failed to initialize WebSocket:', err);
    startPollingFallback();
    emitConnectionStatus('init_failed');
  }
}

/**
 * Disconnect WebSocket and cleanup
 */
export function disconnectWebSocketSync() {
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
  }

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  emitConnectionStatus('manual_disconnect');
}

/**
 * Subscribe to leaderboard updates for a specific level
 */
export function subscribeToLeaderboard(levelIndex) {
  if (isConnected && socket) {
    socket.emit('subscribe:leaderboard', levelIndex);
    console.log('[WSync] Subscribed to leaderboard level', levelIndex);
  }
}

/**
 * Unsubscribe from leaderboard updates
 */
export function unsubscribeFromLeaderboard(levelIndex) {
  if (isConnected && socket) {
    socket.emit('unsubscribe:leaderboard', levelIndex);
    console.log('[WSync] Unsubscribed from leaderboard level', levelIndex);
  }
}

/**
 * Fallback polling mechanism when WebSocket unavailable
 * Polls every 30 seconds for critical updates
 * Does NOT replace REST API actions - only syncs view data
 */
function startPollingFallback() {
  // Already polling?
  if (pollInterval) return;

  console.log('[WSync] Starting fallback polling every 30s...');
  emitConnectionStatus('polling_started');
  pollInterval = setInterval(async () => {
    if (isConnected) {
      // WebSocket reconnected, stop polling
      clearInterval(pollInterval);
      pollInterval = null;
      emitConnectionStatus('polling_stopped');
      return;
    }

    try {
      const res = await fetch('/api/user/me?force=1', {
        credentials: 'include',
        cache: 'no-store'
      });

      if (!res.ok) {
        if (res.status === 401) {
          // Auth expired
          window.location.href = '/auth';
        }
        return;
      }

      const data = await res.json();
      const user = data.user || data;

      // Update cache
      setCachedUser(user);

      // Trigger UI update
      if (window.onUserDataUpdate) {
        window.onUserDataUpdate(user);
      }

      console.log('[WSync] Poll: Updated user data');
      emitConnectionStatus('poll_tick');
    } catch (err) {
      console.warn('[WSync] Poll failed:', err.message);
      emitConnectionStatus('poll_error');
    }
  }, POLL_INTERVAL_MS);
}

/**
 * Check if WebSocket is actively connected
 */
export function isWebSocketConnected() {
  return isConnected;
}

/**
 * Get current connection status for debugging
 */
export function getConnectionStatus() {
  return {
    wsConnected: isConnected,
    socketId: socket?.id || null,
    transportName: socket?.io?.engine?.transport?.name || 'unknown'
  };
}
