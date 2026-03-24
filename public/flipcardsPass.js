import { fetchUserData, updateTopBar, getCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { i18n } from './i18n.js';
import { navigateWithFeedback } from './utils.js';

const PASS_USD_DEFAULT = 0.55;
let currentPassUsd = PASS_USD_DEFAULT;

const root = document.getElementById('flipcards-pass-root');

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram?.WebApp) window.Telegram.WebApp.ready();

  try {
    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    const [user] = await Promise.all([
      fetchUserData(),
      renderPassUI()
    ]);

    updateTopBar(user);
  } catch (err) {
    console.error('Flipcards pass init failed:', err);
    showNotification(i18n.t('pass.failed_load_page'), 'error');
  }
});

async function getPassStatus() {
  const res = await fetch('/api/games/flipcards/status', { credentials: 'include', cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || i18n.t('pass.failed_check_status'));
  return data;
}

function renderCard({ hasActivePass, passValidUntil, passCost, requiresRevalidation }) {
  if (!root) return;
  currentPassUsd = Number(passCost || PASS_USD_DEFAULT);
  const price = currentPassUsd.toFixed(2);
  const activeText = hasActivePass && passValidUntil
    ? i18n.format('pass.active_until', { date: new Date(passValidUntil).toLocaleString() })
    : i18n.t('pass.unlock_24h');

  root.innerHTML = `
    <div class="pass-card">
      <div class="pass-icon">🎴</div>
      <h2>${i18n.t('pass.title')}</h2>
      <p class="pass-description">${activeText}</p>

      <div class="pass-features">
        <div class="feature"><span class="feature-icon">♾️</span><span>${i18n.t('pass.feature_unlimited')}</span></div>
        <div class="feature"><span class="feature-icon">⏱️</span><span>${i18n.t('pass.feature_timer')}</span></div>
        <div class="feature"><span class="feature-icon">🏆</span><span>${i18n.t('pass.feature_rewards')}</span></div>
      </div>

      <div class="pass-price">
        <span class="price-label">${i18n.t('pass.daily_pass')}</span>
        <span class="price-amount">$${price}</span>
      </div>

      <button id="flipcards-primary-btn" class="btn-purchase-pass">
        ${hasActivePass ? i18n.t('pass.play_flipcards') : i18n.t('pass.purchase_pass')}
      </button>
      <button id="flipcards-back-btn" class="btn-cancel-pass">${i18n.t('pass.back_to_games')}</button>
      ${requiresRevalidation ? `<p class="pass-description" style="margin-top:10px;color:#ffd166;">${i18n.t('pass.legacy_pass')}</p>` : ''}
    </div>
  `;
  window.hopeApplyTranslations?.();

  const primaryBtn = document.getElementById('flipcards-primary-btn');
  const backBtn = document.getElementById('flipcards-back-btn');

  if (primaryBtn) {
    primaryBtn.addEventListener('click', async () => {
      if (hasActivePass) {
        navigateWithFeedback('flipcards.html', primaryBtn);
        return;
      }
      await purchasePass(primaryBtn);
    });
  }

  if (backBtn) {
    backBtn.addEventListener('click', () => {
      navigateWithFeedback('marketPlace.html', backBtn);
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
  button.textContent = i18n.t('pass.preparing_wallet');
  try {
    if (typeof tonConnectUI.restoreConnection === 'function') {
      await tonConnectUI.restoreConnection();
    } else if (tonConnectUI.connectionRestored && typeof tonConnectUI.connectionRestored.then === 'function') {
      await tonConnectUI.connectionRestored;
    }

    if (!tonConnectUI.wallet) {
      await tonConnectUI.openModal();
    }
    if (!tonConnectUI.wallet) throw new Error(i18n.t('pass.wallet_required'));

    button.textContent = i18n.t('pass.waiting_payment');
    const priceRes = await fetch(`/api/tonAmount/ton-amount?usd=${currentPassUsd}`, { credentials: 'include' });
    const priceData = await priceRes.json();
    if (!priceRes.ok) throw new Error(priceData.error || i18n.t('pass.ton_amount_failed'));

    const { tonAmount, recipientAddress } = priceData;
    if (!recipientAddress) throw new Error(i18n.t('pass.recipient_not_configured'));

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
    if (!txHash && !txBoc) throw new Error(i18n.t('pass.tx_proof_missing'));

    const purchaseRes = await fetch('/api/games/flipcards/purchase', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash, txBoc })
    });
    const purchaseData = await purchaseRes.json();
    if (!purchaseRes.ok) throw new Error(purchaseData.error || i18n.t('pass.verification_failed'));

    showNotification(i18n.t('pass.purchased_success'), 'success');
    navigateWithFeedback('flipcards.html', button);
  } catch (err) {
    console.error('Flipcards pass purchase failed:', err);
    showNotification(err.message || i18n.t('pass.purchase_failed'), 'error');
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
