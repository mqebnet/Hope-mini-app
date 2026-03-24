// public/script.js
import { i18n } from './i18n.js';
import { fetchUserDataOnce, getCachedUser, setCachedUser, updateTopBar, invalidateCache } from './userData.js';
import { initializeWebSocketSync, disconnectWebSocketSync } from './wsync.js';
import { wireNavigationFeedback } from './utils.js';

let authAttempted = false;

window.onUserDataUpdate = function onUserDataUpdate(user) {
  if (!user || typeof user !== 'object') return;
  const merged = { ...(getCachedUser() || {}), ...user };
  setCachedUser(merged);
  updateTopBar(merged);
  window.dispatchEvent(new CustomEvent('hope:userUpdated', { detail: merged }));
};

window.onGlobalEvent = function onGlobalEvent(event) {
  window.dispatchEvent(new CustomEvent('hope:globalEvent', { detail: event }));
};

window.addEventListener('hope:globalEvent', (event) => {
  const detail = event.detail || {};
  if (detail.type === 'referral_joined') {
    const invitedUsername = String(detail.data?.invitedUsername || '').trim();
    const rewardPoints = Number(detail.data?.rewardPoints || 50);
    const joinedLabel = invitedUsername || i18n.t('script.someone');
    const message = i18n.format('script.referral_joined', {
      name: joinedLabel,
      points: rewardPoints
    });

    if (typeof window.showSuccessToast === 'function') {
      window.showSuccessToast(message);
    } else {
      console.log(message);
    }
    return;
  }

  if (detail.type === 'admin_broadcast') {
    const message = String(detail.data?.message || '').trim();
    if (!message) return;
    if (typeof window.showNotification === 'function') {
      window.showNotification(message, 'info');
    } else {
      console.log('[Broadcast]', message);
    }
    return;
  }

  if (detail.type === 'contest_results_published') {
    const week = String(detail.data?.week || '').trim();
    const notice = week
      ? `Contest results published for ${week}.`
      : 'Contest results were published.';
    if (typeof window.showSuccessToast === 'function') {
      window.showSuccessToast(notice);
    } else {
      console.log(notice);
    }
  }
});

window.addEventListener('beforeunload', () => {
  disconnectWebSocketSync();
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    if (authAttempted) return;
    authAttempted = true;
    wireNavigationFeedback(document);

    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
    }

    const startParam =
      tg?.initDataUnsafe?.start_param ||
      new URLSearchParams(window.location.search).get('tgWebAppStartParam') ||
      '';

    const hasSession = await checkSession();

    if (!hasSession) {
      initializeTelegramWebApp();
    } else {
      if (startParam) {
        const referralApplied = await registerInviteSession(startParam);
        if (referralApplied) {
          invalidateCache();
          const inviteMessage = i18n.format('script.invited_bonus', { points: 100 });
          if (typeof window.showSuccessToast === 'function') {
            window.showSuccessToast(inviteMessage);
          } else {
            console.log(inviteMessage);
          }
        }
      }

      try {
        await fetchUserDataOnce();
      } catch (err) {
        console.warn('Failed to fetch user data:', err);
      }

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
      throw new Error(i18n.t('script.auth_failed'));
    }

    try {
      await fetchUserDataOnce();
    } catch (err) {
      console.warn('Failed to fetch user after auth:', err);
    }

    initializeWebSocketSync();
    console.log('[Auth] WebSocket sync initialized');
  } catch (error) {
    console.error('Auth error:', error);
  }
}

async function registerInviteSession(startParam) {
  try {
    const response = await fetch('/api/invite/register-session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startParam })
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    if (!response.ok) {
      throw new Error(data?.error || `register-session failed (${response.status})`);
    }

    return Boolean(data?.success && data?.applied);
  } catch (err) {
    console.error('Invite register-session failed:', err);
    return false;
  }
}

function initializeLanguage() {
  const tgLanguage = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || 'en';
  const userLanguage = localStorage.getItem('lang') || tgLanguage;
  i18n.init(userLanguage);
  applyTranslations();
}

function applyTranslations() {
  i18n.applyTranslations(document);
  window.dispatchEvent(new CustomEvent('hope:languageChanged', { detail: { lang: i18n.currentLang } }));
}

window.hopeApplyTranslations = applyTranslations;
