// public/auth.js
function showError(message) {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}

async function authenticateWithTelegram() {
  if (!window.Telegram?.WebApp) {
    showError('Not running inside Telegram');
    return;
  }

  const tg = Telegram.WebApp;
  tg.ready();
  tg.expand();

  const initData = tg.initData;
  const startParam =
    tg.initDataUnsafe?.start_param ||
    new URLSearchParams(window.location.search).get('tgWebAppStartParam') ||
    '';
  if (!initData) {
    showError('Telegram initData missing');
    return;
  }

  try {
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData, startParam })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Authentication failed');
    }

    if (data.welcomeBonus) {
      sessionStorage.setItem('hope_welcome_bonus', JSON.stringify({
        amount: Number(data.bonusAmount || 250),
        bronzeTickets: Number(data.bonusBronzeTickets || 0),
        inviterUsername: data.inviterUsername || null
      }));
    }

    window.location.replace('/');
  } catch (err) {
    console.error('Auth failed:', err);
    showError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  authenticateWithTelegram();
});
