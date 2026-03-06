// public/notify.js
(function initNotify() {
  const MAX_TOASTS = 4;
  const AUTO_CLOSE_MS = 3600;
  const originalAlert = window.alert.bind(window);

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

  function showNotification(message, type = 'info') {
    const host = ensureHost();
    if (!host) {
      originalAlert(String(message || '').trim() || 'Something happened');
      return null;
    }
    const safeType = ['info', 'success', 'error', 'warn'].includes(type) ? type : 'info';

    const toast = document.createElement('div');
    toast.className = `notification ${safeType}`;
    toast.setAttribute('role', safeType === 'error' ? 'alert' : 'status');
    toast.textContent = String(message || '').trim() || 'Something happened';
    host.appendChild(toast);

    const existing = host.querySelectorAll('.notification');
    if (existing.length > MAX_TOASTS) {
      dismissToast(existing[0]);
    }

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => dismissToast(toast), AUTO_CLOSE_MS);

    return toast;
  }

  function formatCompact(value) {
    const n = Number(value) || 0;
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return String(n);
  }

  function showRewardPopup(reward = {}, options = {}) {
    const title = options.title || 'Reward Claimed';
    const points = Number(reward.points || 0);
    const xp = Number(reward.xp || 0);
    const bronze = Number(reward.bronzeTickets || 0);
    const silver = Number(reward.silverTickets || 0);
    const gold = Number(reward.goldTickets || 0);

    const existing = document.getElementById('checkin-success-pop');
    if (existing) existing.remove();

    const pills = [
      bronze > 0 ? '<div class="checkin-success-pill bronze"><span class="pill-label">Bronze</span><span data-count="' + bronze + '" class="pill-value">+0</span></div>' : '',
      silver > 0 ? '<div class="checkin-success-pill silver"><span class="pill-label">Silver</span><span data-count="' + silver + '" class="pill-value">+0</span></div>' : '',
      gold > 0 ? '<div class="checkin-success-pill gold"><span class="pill-label">Gold</span><span data-count="' + gold + '" class="pill-value">+0</span></div>' : '',
      xp > 0 ? '<div class="checkin-success-pill xp"><span class="pill-label">XP</span><span data-count="' + xp + '" class="pill-value">+0</span></div>' : ''
    ].filter(Boolean).join('');

    const pop = document.createElement('div');
    pop.id = 'checkin-success-pop';
    pop.className = 'checkin-success-pop';
    pop.innerHTML = `
      <div class="checkin-success-card">
        <div class="checkin-success-title">${title}</div>
        <div class="checkin-success-reward"><span id="reward-points" data-count="${points}">+0</span> Points</div>
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

  window.showNotification = showNotification;
  window.showRewardPopup = showRewardPopup;
  window.showSuccessToast = (msg) => showNotification(msg, 'success');
  window.showErrorToast = (msg) => showNotification(msg, 'error');

  // Keep legacy alert() calls visually consistent in app UI.
  window.alert = (msg) => {
    showNotification(msg, 'info');
    return undefined;
  };

  window.__restoreNativeAlert = () => {
    window.alert = originalAlert;
  };
})();
