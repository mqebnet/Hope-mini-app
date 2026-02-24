// public/auth.js
console.log("TELEGRAM WEBAPP:", Telegram.WebApp);
console.log("initDataUnsafe:", Telegram.WebApp.initDataUnsafe);

function showError(message) {
  const el = document.getElementById('error');
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

  if (!initData) {
    showError('Telegram initData missing');
    return;
  }

  console.log('Sending initData:', initData); // Log for debugging

  try {
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Authentication failed');
    }

    // Redirect to dashboard on success
    window.location.replace('/');
  } catch (err) {
    console.error(err);
    showError(err.message);
  }
}

/* ======================
   DEV TEST LOGIN ONLY
====================== */
async function testLogin() {
  try {
    const res = await fetch('/api/test-login', { method: 'POST' });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || 'Test login failed');
    }

    window.location.replace('/');
  } catch (err) {
    showError(err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  authenticateWithTelegram();

  document
    .getElementById('test-login')
    .addEventListener('click', testLogin);
});