// public/notify.js
(function initNotify() {
  const MAX_TOASTS = 4;
  const AUTO_CLOSE_MS = 3600;
  const originalAlert = window.alert.bind(window);
  const HAPTIC_STORAGE_KEY = 'hope_haptic_enabled';
  const SOUND_STORAGE_KEY = 'hope_sound_enabled';
  let audioCtx = null;
  const translate = (key, fallback) => {
    try {
      if (typeof window.hopeI18nT === 'function') {
        const value = window.hopeI18nT(key);
        if (typeof value === 'string' && value && value !== key) return value;
      }
    } catch (_) {}
    return fallback;
  };

  function ensureHost() {
    if (!document.body) return null;
    let host = document.getElementById('notification-host');
    if (host) return host;

    host = document.createElement('div');
    host.id = 'notification-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
    return host;
  }

  function dismissToast(toast) {
    if (!toast || !toast.parentElement) return;
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 220);
  }

  function parseEnabled(raw, fallback = true) {
    if (raw === null || raw === undefined) return fallback;
    const value = String(raw).trim().toLowerCase();
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
    return fallback;
  }

  function isHapticEnabled() {
    return parseEnabled(localStorage.getItem(HAPTIC_STORAGE_KEY), true);
  }

  function isSoundEnabled() {
    return parseEnabled(localStorage.getItem(SOUND_STORAGE_KEY), true);
  }

  function triggerHaptic(type) {
    if (!isHapticEnabled()) return;

    const haptic = window.Telegram?.WebApp?.HapticFeedback;
    try {
      if (haptic?.notificationOccurred) {
        if (type === 'success') haptic.notificationOccurred('success');
        else if (type === 'error') haptic.notificationOccurred('error');
        else if (type === 'warn') haptic.notificationOccurred('warning');
        else if (haptic.impactOccurred) haptic.impactOccurred('light');
      } else if (haptic?.impactOccurred) {
        const style = type === 'error' ? 'heavy' : type === 'warn' ? 'medium' : 'light';
        haptic.impactOccurred(style);
      }
    } catch (_) {
      // fall through to device vibration
    }

    try {
      if (typeof navigator.vibrate === 'function') {
        if (type === 'error') navigator.vibrate([45, 30, 45]);
        else if (type === 'success') navigator.vibrate([25, 20, 25]);
        else if (type === 'warn') navigator.vibrate([35]);
        else navigator.vibrate([18]);
      }
    } catch (_) {
      // best effort only
    }
  }

  function ensureAudioContext() {
    if (audioCtx && audioCtx.state !== 'closed') return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  }

  function primeAudioContext() {
    const ctx = ensureAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    document.removeEventListener('pointerdown', primeAudioContext, true);
    document.removeEventListener('keydown', primeAudioContext, true);
  }

  function playTone(type) {
    if (!isSoundEnabled()) return;
    const ctx = ensureAudioContext();
    if (!ctx) return;

    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = type === 'success' ? 880 : type === 'error' ? 250 : type === 'warn' ? 420 : 660;
      gainNode.gain.setValueAtTime(0.0001, now);
      gainNode.gain.exponentialRampToValueAtTime(0.035, now + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.14);
    } catch (_) {
      // best effort only
    }
  }

  function triggerFeedback(type) {
    triggerHaptic(type);
    playTone(type);
  }

  document.addEventListener('pointerdown', primeAudioContext, true);
  document.addEventListener('keydown', primeAudioContext, true);

  function showNotification(message, type = 'info') {
    const host = ensureHost();
    if (!host) {
      originalAlert(String(message || '').trim() || translate('common.something_happened', 'Something happened'));
      return null;
    }
    const safeType = ['info', 'success', 'error', 'warn'].includes(type) ? type : 'info';
    triggerFeedback(safeType);

    const toast = document.createElement('div');
    toast.className = `notification ${safeType}`;
    toast.setAttribute('role', safeType === 'error' ? 'alert' : 'status');
    toast.textContent = String(message || '').trim() || translate('common.something_happened', 'Something happened');
    host.appendChild(toast);

    const existing = host.querySelectorAll('.notification');
    if (existing.length > MAX_TOASTS) {
      dismissToast(existing[0]);
    }

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => dismissToast(toast), AUTO_CLOSE_MS);

    return toast;
  }

  function showStickyNotice(message, options = {}) {
    const host = document.body;
    if (!host) {
      originalAlert(String(message || '').trim() || translate('common.something_happened', 'Something happened'));
      return null;
    }

    const noticeType = String(options.type || 'info');
    triggerHaptic(noticeType);
    const title = String(options.title || translate('common.notice', 'Notice')).trim() || translate('common.notice', 'Notice');
    const okText = String(options.okText || translate('common.ok', 'OK')).trim() || translate('common.ok', 'OK');
    const text = String(message || '').trim() || translate('common.something_happened', 'Something happened');

    const existing = document.getElementById('sticky-notice-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'sticky-notice-modal';
    modal.className = 'reward-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-live', 'assertive');

    const content = document.createElement('div');
    content.className = 'reward-content';

    const heading = document.createElement('h2');
    heading.textContent = title;
    content.appendChild(heading);

    const body = document.createElement('p');
    body.textContent = text;
    content.appendChild(body);

    const okButton = document.createElement('button');
    okButton.type = 'button';
    okButton.className = 'btn-primary';
    okButton.textContent = okText;
    content.appendChild(okButton);

    modal.appendChild(content);
    host.appendChild(modal);

    const close = () => {
      if (!modal.parentElement) return;
      modal.remove();
      if (typeof options.onClose === 'function') {
        try { options.onClose(); } catch (_) {}
      }
    };

    okButton.addEventListener('click', close, { once: true });
    setTimeout(() => okButton.focus(), 0);

    return modal;
  }

  // Handle fetch errors globally, especially 429 rate limit
  window.addEventListener('unhandledrejection', (event) => {
    const err = event.reason;
    if (err?.message?.includes('RATE_LIMITED') || err?.status === 429) {
      showNotification(
        translate('common.rate_limited', 'Too many requests. Please wait a moment and try again.'),
        'error'
      );
      event.preventDefault();
    }
  });

  function formatCompact(value) {
    const n = Number(value) || 0;
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  }

  function showRewardPopup(reward = {}, options = {}) {
    triggerHaptic('success');
    const title = options.title || translate('common.reward_claimed', 'Reward Claimed');
    const pointsLabel = translate('common.points', 'Points');
    const bronzeLabel = translate('common.bronze', 'Bronze');
    const silverLabel = translate('common.silver', 'Silver');
    const goldLabel = translate('common.gold', 'Gold');
    const xpLabel = translate('topbar.xp', 'XP');
    const points = Number(reward.points || 0);
    const xp = Number(reward.xp || 0);
    const bronze = Number(reward.bronzeTickets || 0);
    const silver = Number(reward.silverTickets || 0);
    const gold = Number(reward.goldTickets || 0);

    const existing = document.getElementById('checkin-success-pop');
    if (existing) existing.remove();

    const pills = [
      bronze > 0 ? '<div class="checkin-success-pill bronze"><span class="pill-label">' + bronzeLabel + '</span><span data-count="' + bronze + '" class="pill-value">+0</span></div>' : '',
      silver > 0 ? '<div class="checkin-success-pill silver"><span class="pill-label">' + silverLabel + '</span><span data-count="' + silver + '" class="pill-value">+0</span></div>' : '',
      gold > 0 ? '<div class="checkin-success-pill gold"><span class="pill-label">' + goldLabel + '</span><span data-count="' + gold + '" class="pill-value">+0</span></div>' : '',
      xp > 0 ? '<div class="checkin-success-pill xp"><span class="pill-label">' + xpLabel + '</span><span data-count="' + xp + '" class="pill-value">+0</span></div>' : ''
    ].filter(Boolean).join('');

    const pop = document.createElement('div');
    pop.id = 'checkin-success-pop';
    pop.className = 'checkin-success-pop';
    pop.innerHTML = `
      <div class="checkin-success-card">
        <div class="checkin-success-title">${title}</div>
        <div class="checkin-success-reward"><span id="reward-points" data-count="${points}">+0</span> ${pointsLabel}</div>
        <div class="checkin-success-grid">${pills}</div>
      </div>
    `;

    document.body.appendChild(pop);

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    const animateCount = (el, value, durationMs = 820) => {
      if (!el) return;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min((now - start) / durationMs, 1);
        const current = Math.round(value * easeOutCubic(t));
        el.textContent = `+${formatCompact(current)}`;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    animateCount(pop.querySelector('#reward-points'), points, 900);
    pop.querySelectorAll('[data-count]').forEach((el, idx) => {
      const value = Number(el.getAttribute('data-count') || 0);
      animateCount(el, value, 700 + idx * 80);
    });

    requestAnimationFrame(() => pop.classList.add('show'));
    setTimeout(() => {
      pop.classList.remove('show');
      setTimeout(() => pop.remove(), 240);
    }, Number(options.durationMs || 2400));
  }

  function fireConfetti(options = {}) {
    if (typeof confetti !== 'function') return;
    try {
      // Always create a fresh canvas — reusing a canvas whose OffscreenCanvas
      // was already transferred to a worker causes a persistent white overlay
      // on Android WebView after particles finish.
      let canvas = document.getElementById('__confetti-canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = '__confetti-canvas';
        canvas.style.cssText = [
          'position:fixed',
          'inset:0',
          'width:100%',
          'height:100%',
          'pointer-events:none',
          'z-index:4100',
          'background:transparent'
        ].join(';');
        document.body.appendChild(canvas);
      }

      if (!canvas.__confettiInstance) {
        canvas.__confettiInstance = confetti.create(canvas, {
          resize: true,
          useWorker: false  // true causes persistent white screen on Android WebView:
                            // transferControlToOffscreen() makes the canvas render white
                            // after the OffscreenCanvas worker finishes rendering
        });
      }

      canvas.__confettiInstance(options);

      // Remove canvas after the animation completes so the full-screen
      // transparent-but-white-rendering canvas doesn't sit over the page.
      clearTimeout(canvas.__cleanupTimer);
      canvas.__cleanupTimer = setTimeout(() => {
        if (canvas.__confettiInstance) {
          canvas.__confettiInstance.reset();
          canvas.__confettiInstance = null;
        }
        canvas.remove();
      }, 3500);
    } catch (_) {
      confetti(options);
    }
  }

  window.showNotification = showNotification;
  window.showRewardPopup = showRewardPopup;
  window.fireConfetti = fireConfetti;
  window.showSuccessToast = (msg) => showNotification(msg, 'success');
  window.showErrorToast = (msg) => showNotification(msg, 'error');
  window.hopeTriggerHaptic = (type = 'info') => triggerHaptic(type);
  window.hopeTriggerFeedback = (type = 'info') => triggerFeedback(type);
  window.showStickyNotice = showStickyNotice;

  // Keep legacy alert() calls visually consistent in app UI.
  window.alert = (msg) => {
    showNotification(msg, 'info');
    return undefined;
  };

  window.__restoreNativeAlert = () => {
    window.alert = originalAlert;
  };
})();
