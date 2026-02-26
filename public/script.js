// public/script.js
import { updateUI } from './userData.js';
import { i18n } from './i18n.js';

const POLL_MS = 30_000;
let pollId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const hasSession = await checkSession();
  if (hasSession) {
    startPolling();
    fetchAuthenticatedUser();
  } else {
    initializeTelegramWebApp();
  }

  initializeLanguage();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopPolling();
  else startPolling();
});

async function checkSession() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

function startPolling() {
  stopPolling();
  pollId = setInterval(fetchAuthenticatedUser, POLL_MS);
}

function stopPolling() {
  if (!pollId) return;
  clearInterval(pollId);
  pollId = null;
}

function initializeTelegramWebApp() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.ready();
  tg.expand();

  const user = tg.initDataUnsafe?.user;
  if (!user) return;

  authenticateTelegramUser(tg.initData);
}

async function authenticateTelegramUser(initData) {
  try {
    const response = await fetch('/api/auth/telegram', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });

    if (!response.ok) throw new Error('Authentication failed');

    startPolling();
    fetchAuthenticatedUser();
  } catch (error) {
    console.error('Auth error:', error);
  }
}

async function fetchAuthenticatedUser() {
  try {
    const res = await fetch('/api/user/me', { credentials: 'include' });

    if (res.status === 401) {
      window.location.href = '/auth';
      return;
    }

    if (!res.ok) {
      throw new Error(`User fetch failed (${res.status})`);
    }

    const data = await res.json();
    updateUI(data.user);
  } catch (err) {
    // Do not force redirect on transient network issues
    console.error('User fetch failed:', err);
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
