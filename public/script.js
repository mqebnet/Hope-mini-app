// public/script.js
import { i18n } from './i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
  const hasSession = await checkSession();
  if (!hasSession) {
    initializeTelegramWebApp();
  }
  initializeLanguage();
});

async function checkSession() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
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

