// public/script.js
import { i18n } from './i18n.js';
import { fetchUserDataOnce, getCachedUser } from './cache.js';
import { initializeWebSocketSync } from './wsync.js';

// Track if auth has already been attempted
let authAttempted = false;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Key fix #1: Prevent double auth
    if (authAttempted) return;
    authAttempted = true;

    // Check if already authenticated
    const hasSession = await checkSession();
    
    if (!hasSession) {
      // Initialize Telegram and authenticate
      initializeTelegramWebApp();
    } else {
      // Already authenticated, fetch user data once
      try {
        await fetchUserDataOnce();
      } catch (err) {
        console.warn('Failed to fetch user data:', err);
      }
      
      // Initialize WebSocket for real-time updates (even if already logged in)
      initializeWebSocketSync();
      console.log('[Auth] WebSocket sync initialized (existing session)');
    }
  } catch (err) {
    console.error('Script initialization error:', err);
  } finally {
    initializeLanguage();
  }
});

async function checkSession() {
  try {
    const res = await fetch('/api/me', {
      credentials: 'include',
      cache: 'no-store'
    });
    return res.ok;
  } catch {
    return false;
  }
}

function initializeTelegramWebApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.ready();
  tg.expand();

  const user = tg.initDataUnsafe?.user;
  if (!user) return;

  const fallbackStartParam =
    tg.initDataUnsafe?.start_param ||
    new URLSearchParams(window.location.search).get('tgWebAppStartParam') ||
    '';

  authenticateTelegramUser(tg.initData, fallbackStartParam);
}

async function authenticateTelegramUser(initData, startParam = '') {
  try {
    const response = await fetch('/api/auth/telegram', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, startParam })
    });

    if (!response.ok) {
      throw new Error('Authentication failed');
    }

    // After successful auth, fetch user data once
    try {
      await fetchUserDataOnce();
    } catch (err) {
      console.warn('Failed to fetch user after auth:', err);
    }

    // Initialize WebSocket sync for real-time updates (replaces polling)
    // JWT is in httpOnly cookie and will be sent automatically with credentials
    initializeWebSocketSync();
    console.log('[Auth] WebSocket sync initialized');
  } catch (error) {
    console.error('Auth error:', error);
  }
}

function initializeLanguage() {
  const tgLanguage = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'en';
  const userLanguage = localStorage.getItem('lang') || tgLanguage;
  i18n.init(userLanguage);
  applyTranslations();
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    el.textContent = i18n.t(key);
  });
}
