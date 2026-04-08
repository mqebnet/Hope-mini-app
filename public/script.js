// public/script.js
import { i18n } from './i18n.js';
import { fetchUserDataOnce, getCachedUser, setCachedUser, updateTopBar, invalidateCache } from './userData.js';
import { initializeWebSocketSync, disconnectWebSocketSync } from './wsync.js';
import { wireNavigationFeedback } from './utils.js';

let authAttempted = false;
const WELCOME_BONUS_STORAGE_KEY = 'hope_welcome_bonus';

function normalizeWelcomeBonusPayload(payload = {}) {
  return {
    amount: Number(payload.amount || 250),
    bronzeTickets: Number(payload.bronzeTickets || 0),
    inviterUsername: payload.inviterUsername || null
  };
}

function buildWelcomeBonusMessage(payload) {
  const amount = Number(payload.amount || 250);
  const bronzeTickets = Number(payload.bronzeTickets || 0);
  const rawInviter = String(payload.inviterUsername || '').trim();
  const safeInviter = /^user_\d+$/i.test(rawInviter) ? '' : rawInviter;
  const inviterLabel = safeInviter
    ? (safeInviter.startsWith('@') ? safeInviter : `@${safeInviter}`)
    : i18n.t('home.your_inviter');

  const parts = [i18n.format('home.welcome_bonus_points_from', { amount, inviter: inviterLabel })];
  if (bronzeTickets > 0) {
    parts.push(i18n.format('home.welcome_bonus_bronze', { count: bronzeTickets }));
  }
  return parts.join(' ');
}

function tryDisplayWelcomeBonus(payload) {
  if (typeof window.showStickyNotice !== 'function') return false;

  const message = buildWelcomeBonusMessage(payload);
  if (typeof window.fireConfetti === 'function') {
    window.fireConfetti({ particleCount: 110, spread: 82, origin: { y: 0.6 } });
  }
  const modal = window.showStickyNotice(message, {
    title: i18n.t('home.welcome_bonus_title'),
    okText: i18n.t('common.ok')
  });
  return Boolean(modal);
}

function queueWelcomeBonus(payload) {
  const normalized = normalizeWelcomeBonusPayload(payload);
  sessionStorage.setItem(WELCOME_BONUS_STORAGE_KEY, JSON.stringify(normalized));

  window.dispatchEvent(new CustomEvent('hope:welcomeBonusUpdated'));

  if (typeof window.showStickyNotice !== 'function') {
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      if (typeof window.showStickyNotice === 'function') {
        clearInterval(poll);
        window.dispatchEvent(new CustomEvent('hope:welcomeBonusUpdated'));
      } else if (attempts >= 20) {
        clearInterval(poll);
      }
    }, 100);
    return;
  }

  if (tryDisplayWelcomeBonus(normalized)) {
    sessionStorage.removeItem(WELCOME_BONUS_STORAGE_KEY);
  }
}

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
      ? i18n.format('script.contest_results_published_for', { week })
      : i18n.t('script.contest_results_published');
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
        const referralSession = await registerInviteSession(startParam);
        if (referralSession?.applied) {
          invalidateCache();
          queueWelcomeBonus({
            amount: Number(referralSession.bonusAmount || 250),
            bronzeTickets: Number(referralSession.bonusBronzeTickets || 0),
            inviterUsername: referralSession.inviterUsername || null
          });
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

    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    if (!response.ok || !payload?.success) {
      throw new Error(i18n.t('script.auth_failed'));
    }

    if (payload?.welcomeBonus) {
      queueWelcomeBonus({
        amount: Number(payload.bonusAmount || 250),
        bronzeTickets: Number(payload.bonusBronzeTickets || 0),
        inviterUsername: payload.inviterUsername || null
      });
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

    return {
      applied: Boolean(data?.success && data?.applied),
      inviterUsername: data?.inviterUsername || null,
      bonusAmount: Number(data?.bonusAmount || 0),
      bonusBronzeTickets: Number(data?.bonusBronzeTickets || 0)
    };
  } catch (err) {
    console.error('Invite register-session failed:', err);
    return { applied: false };
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
