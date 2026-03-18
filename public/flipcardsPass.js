import { fetchUserData, updateTopBar, getCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';

const PASS_USD_DEFAULT = 0.55;
let currentPassUsd = PASS_USD_DEFAULT;

const root = document.getElementById('flipcards-pass-root');

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram?.WebApp) window.Telegram.WebApp.ready();

  try {
    // Render top bar from cache immediately — script.js already authenticated
    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    // Fetch fresh user data and render pass UI in parallel
    const [user] = await Promise.all([
      fetchUserData(),
      renderPassUI()
    ]);

    updateTopBar(user);
  } catch (err) {
    console.error('Flipcards pass init failed:', err);
    showNotification('Failed to load pass page', 'error');
  }
});

async function getPassStatus() {
  const res = await fetch('/api/games/flipcards/status', { credentials: 'include', cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to check pass status');
  return data;
}

function renderCard({ hasActivePass, passValidUntil, passCost, requiresRevalidation }) {
  if (!root) return;
  currentPassUsd = Number(passCost || PASS_USD_DEFAULT);
  const price = currentPassUsd.toFixed(2);
  const activeText = hasActivePass && passValidUntil
    ? `Pass active until ${new Date(passValidUntil).toLocaleString()}`
    : 'Unlock Flip Cards for 24 hours';

  root.innerHTML = `
    <div class="pass-card">
      <div class="pass-icon">🎴</div>
      <h2>Flip Cards Pass</h2>
      <p class="pass-description">${activeText}</p>

      <div class="pass-features">
        <div class="feature"><span class="feature-icon">♾️</span><span>Unlimited plays for 24h</span></div>
        <div class="feature"><span class="feature-icon">⏱️</span><span>Difficulty-based timer challenge</span></div>
        <div class="feature"><span class="feature-icon">🏆</span><span>Earn points, XP and tickets</span></div>
      </div>

      <div class="pass-price">
        <span class="price-label">Daily Pass</span>
        <span class="price-amount">$${price}</span>
      </div>

      <button id="flipcards-primary-btn" class="btn-purchase-pass">
        ${hasActivePass ? 'Play Flip Cards' : 'Purchase Pass'}
      </button>
      <button id="flipcards-back-btn" class="btn-cancel-pass">Back to Games</button>
      ${requiresRevalidation ? '<p class="pass-description" style="margin-top:10px;color:#ffd166;">Legacy pass detected. Re-purchase required for verified access.</p>' : ''}
    </div>
  `;

  const primaryBtn = document.getElementById('flipcards-primary-btn');
  const backBtn = document.getElementById('flipcards-back-btn');

  if (primaryBtn) {
    primaryBtn.addEventListener('click', async () => {
      if (hasActivePass) {
        window.location.href = 'flipcards.html';
        return;
      }
      await purchasePass(primaryBtn);
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = 'marketPlace.html';
    });
  }
}

async function renderPassUI() {
  const status = await getPassStatus();
  renderCard(status);
}

async function purchasePass(button) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Preparing wallet...';
  try {
    if (typeof tonConnectUI.restoreConnection === 'function') {
      await tonConnectUI.restoreConnection();
    } else if (tonConnectUI.connectionRestored && typeof tonConnectUI.connectionRestored.then === 'function') {
      await tonConnectUI.connectionRestored;
    }

    if (!tonConnectUI.wallet) {
      await tonConnectUI.openModal();
    }
    if (!tonConnectUI.wallet) throw new Error('Please connect your TON wallet first');

    button.textContent = 'Waiting for payment...';
    const priceRes = await fetch(`/api/tonAmount/ton-amount?usd=${currentPassUsd}`, { credentials: 'include' });
    const priceData = await priceRes.json();
    if (!priceRes.ok) throw new Error(priceData.error || 'Failed to get TON amount');

    const { tonAmount, recipientAddress } = priceData;
    if (!recipientAddress) throw new Error('Payment recipient is not configured');

    const tx = await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: recipientAddress,
          amount: (tonAmount * 1e9).toFixed(0)
        }
      ]
    });

    const txHash = tx?.transaction?.hash || tx?.txid?.hash || tx?.hash || '';
    const txBoc = tx?.boc || '';
    if (!txHash && !txBoc) throw new Error('Transaction proof missing');

    const purchaseRes = await fetch('/api/games/flipcards/purchase', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash, txBoc })
    });
    const purchaseData = await purchaseRes.json();
    if (!purchaseRes.ok) throw new Error(purchaseData.error || 'Purchase verification failed');

    showNotification('Pass purchased successfully', 'success');
    window.location.href = 'flipcards.html';
  } catch (err) {
    console.error('Flipcards pass purchase failed:', err);
    showNotification(err.message || 'Pass purchase failed', 'error');
    button.disabled = false;
    button.textContent = original;
  }
}

function showNotification(message, type = 'info') {
  if (type === 'success' && typeof window.showSuccessToast === 'function') {
    window.showSuccessToast(message);
    return;
  }
  if (type === 'error' && typeof window.showErrorToast === 'function') {
    window.showErrorToast(message);
    return;
  }
  if (type === 'warn' && typeof window.showWarningToast === 'function') {
    window.showWarningToast(message);
    return;
  }
  alert(message);
}
