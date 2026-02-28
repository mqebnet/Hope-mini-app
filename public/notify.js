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

  window.showNotification = showNotification;
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
