import { fetchUserData, updateTopBar, getCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { i18n } from './i18n.js';
import { getTxProof, navigateWithFeedback } from './utils.js';

const PASS_USD_DEFAULT = 0.55;
const PENDING_GAMEPASS_TX_KEY = 'pendingGamePassPurchaseTx';
const PENDING_GAMEPASS_TX_MAX_AGE_MS = 30 * 60 * 1000;
const root = document.getElementById('gamepass-root');

const GAME_META = {
  flipcards: {
    nameKey: 'games.flipcards_name',
    fallbackName: 'Flip Cards',
    page: 'flipcards.html',
    icon: '🎴'
  },
  slidingtiles: {
    nameKey: 'games.slidingtiles_name',
    fallbackName: 'Sliding Tiles',
    page: 'slidingTiles.html',
    icon: '🧩'
  },
  blocktower: {
    nameKey: 'games.blocktower_name',
    fallbackName: 'Block Tower',
    page: 'blockTower.html',
    icon: '🧱'
  },
  shellgame: {
    nameKey: 'games.shellgame_name',
    fallbackName: 'Red ball',
    page: 'shellGame.html',
    icon: '\u{1F534}'
  }
};

let currentPassUsd = PASS_USD_DEFAULT;

function savePendingGamePassTx(txHash, txBoc) {
  try {
    localStorage.setItem(PENDING_GAMEPASS_TX_KEY, JSON.stringify({
      txHash: txHash || '',
      txBoc: txBoc || '',
      timestamp: Date.now()
    }));
  } catch (err) {
    console.warn('Failed to persist pending game pass transaction:', err);
  }
}

function clearPendingGamePassTx() {
  try {
    localStorage.removeItem(PENDING_GAMEPASS_TX_KEY);
  } catch (err) {
    console.warn('Failed to clear pending game pass transaction:', err);
  }
}

function loadPendingGamePassTx() {
  try {
    const raw = localStorage.getItem(PENDING_GAMEPASS_TX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const timestamp = Number(parsed?.timestamp || 0);
    const txHash = typeof parsed?.txHash === 'string' ? parsed.txHash.trim() : '';
    const txBoc = typeof parsed?.txBoc === 'string' ? parsed.txBoc.trim() : '';
    if (!txHash && !txBoc) {
      clearPendingGamePassTx();
      return null;
    }
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > PENDING_GAMEPASS_TX_MAX_AGE_MS) {
      clearPendingGamePassTx();
      return null;
    }
    return { txHash, txBoc };
  } catch (err) {
    console.warn('Failed to parse pending game pass transaction:', err);
    clearPendingGamePassTx();
    return null;
  }
}

function setPassPendingState() {
  const primaryBtn = document.getElementById('gamepass-primary-btn');
  if (!primaryBtn) return;
  primaryBtn.disabled = true;
  primaryBtn.textContent = i18n.t('pass.waiting_payment');
}

function getSelectedGame() {
  const params = new URLSearchParams(window.location.search);
  const gameId = String(params.get('game') || 'flipcards').toLowerCase();
  return { id: gameId, ...(GAME_META[gameId] || GAME_META.flipcards) };
}

function tWithFallback(key, fallback) {
  const value = i18n.t(key);
  if (key === 'pass.feature_shared_access') {
    return getSharedAccessText();
  }
  return value && value !== key ? value : fallback;
}

function getSelectedGameName() {
  const selectedGame = getSelectedGame();
  return tWithFallback(selectedGame.nameKey, selectedGame.fallbackName);
}

function getSharedAccessText() {
  const translated = i18n.t('pass.feature_shared_access');
  if (translated && translated !== 'pass.feature_shared_access' && /red ball/i.test(translated)) {
    return translated;
  }
  return 'One pass unlocks Flip Cards, Sliding Tiles, Block Tower, and Red ball';
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram?.WebApp) window.Telegram.WebApp.ready();

  try {
    document.title = tWithFallback('pass.document_title', 'Hope - Game Pass');

    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    const [user] = await Promise.all([
      fetchUserData(),
      renderPassUI()
    ]);

    updateTopBar(user);
    if (loadPendingGamePassTx()) {
      setPassPendingState();
      await retryPendingGamePassPurchase();
    }
  } catch (err) {
    console.error('Game pass init failed:', err);
    showNotification(i18n.t('pass.failed_load_page'), 'error');
  }
});

async function getPassStatus() {
  const selectedGame = getSelectedGame();
  const res = await fetch(`/api/games/${selectedGame.id}/status`, {
    credentials: 'include',
    cache: 'no-store'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || i18n.t('pass.failed_check_status'));
  return data;
}

function renderCard({ hasActivePass, passValidUntil, passCost, requiresRevalidation }) {
  if (!root) return;

  const selectedGame = getSelectedGame();
  const selectedGameName = getSelectedGameName();
  currentPassUsd = Number(passCost || PASS_USD_DEFAULT);
  const price = currentPassUsd.toFixed(2);
  const activeText = hasActivePass && passValidUntil
    ? i18n.format('pass.active_until', { date: new Date(passValidUntil).toLocaleString() })
    : tWithFallback('pass.unlock_24h', 'Unlock all game-pass titles for 24 hours');

  root.innerHTML = `
    <div class="pass-card">
      <div class="pass-icon">${selectedGame.icon}</div>
      <h2>${tWithFallback('pass.title', 'Game Pass')}</h2>
      <p class="pass-description">${activeText}</p>
      <div class="pass-target-game">
        <span class="pass-target-label">${tWithFallback('pass.selected_game', 'Selected game')}</span>
        <strong>${selectedGameName}</strong>
      </div>

      <div class="pass-features">
        <div class="feature"><span class="feature-icon">🎮</span><span>${tWithFallback('pass.feature_unlimited', 'Unlimited plays for 24h')}</span></div>
        <div class="feature"><span class="feature-icon">🗝️</span><span>${tWithFallback('pass.feature_shared_access', 'One pass unlocks Flip Cards, Sliding Tiles, and Block Tower')}</span></div>
        <div class="feature"><span class="feature-icon">🏆</span><span>${tWithFallback('pass.feature_rewards', 'Earn points, XP and tickets')}</span></div>
      </div>

      <div class="pass-price">
        <span class="price-label">${tWithFallback('pass.daily_pass', 'Daily Pass')}</span>
        <span class="price-amount">$${price}</span>
      </div>

      <button id="gamepass-primary-btn" class="btn-purchase-pass">
        ${hasActivePass ? tWithFallback('pass.play_selected_game', 'Play Selected Game') : tWithFallback('pass.purchase_pass', 'Purchase Pass')}
      </button>
      <button id="gamepass-back-btn" class="btn-back-games">${tWithFallback('pass.back_to_games', 'Back to Games')}</button>
      ${requiresRevalidation ? `<p class="pass-description" style="margin-top:10px;color:#ffd166;">${i18n.t('pass.legacy_pass')}</p>` : ''}
    </div>
  `;
  window.hopeApplyTranslations?.();

  const primaryBtn = document.getElementById('gamepass-primary-btn');
  const backBtn = document.getElementById('gamepass-back-btn');

  if (primaryBtn) {
    primaryBtn.addEventListener('click', async () => {
      if (hasActivePass) {
        navigateWithFeedback(selectedGame.page, primaryBtn);
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
  if (loadPendingGamePassTx()) {
    setPassPendingState();
  }
}

async function retryPendingGamePassPurchase(options = {}) {
  const { notifyOnRetry = false } = options;
  const pending = loadPendingGamePassTx();
  if (!pending) return 'none';

  setPassPendingState();
  try {
    const selectedGame = getSelectedGame();
    const purchaseRes = await fetch(`/api/games/${selectedGame.id}/purchase`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash: pending.txHash, txBoc: pending.txBoc })
    });
    const purchaseData = await purchaseRes.json().catch(() => ({}));

    if (purchaseRes.ok) {
      clearPendingGamePassTx();
      await renderPassUI();
      return 'resolved';
    }

    const errorMsg = String(purchaseData?.error || '').trim();
    const normalized = errorMsg.toLowerCase();
    const alreadyApplied =
      normalized.includes('already active') ||
      normalized.includes('transaction already used');
    if (alreadyApplied) {
      clearPendingGamePassTx();
      await renderPassUI();
      return 'resolved';
    }

    const hardFailure =
      normalized.includes('below required') ||
      normalized.includes('wrong recipient') ||
      normalized.includes('no outgoing payment') ||
      normalized.includes('invalid wallet') ||
      normalized.includes('user not found');
    if (hardFailure) {
      clearPendingGamePassTx();
      await renderPassUI();
      if (notifyOnRetry && errorMsg) {
        showNotification(errorMsg, 'error');
      }
      return 'failed';
    }

    if (notifyOnRetry) {
      showNotification(i18n.t('pass.waiting_payment'), 'info');
    }
    return 'pending';
  } catch (err) {
    console.warn('Pending game pass purchase retry failed:', err);
    if (notifyOnRetry) {
      showNotification(i18n.t('pass.waiting_payment'), 'info');
    }
    return 'pending';
  }
}

async function purchasePass(button) {
  const selectedGame = getSelectedGame();
  const original = button.textContent;
  button.disabled = true;
  button.textContent = i18n.t('pass.preparing_wallet');

  try {
    const pendingResult = await retryPendingGamePassPurchase({ notifyOnRetry: true });
    if (pendingResult !== 'none') {
      return;
    }

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

    const { txHash, txBoc } = getTxProof(tx, 'game-pass');
    if (!txHash && !txBoc) throw new Error(i18n.t('pass.tx_proof_missing'));
    savePendingGamePassTx(txHash, txBoc);

    const purchaseRes = await fetch(`/api/games/${selectedGame.id}/purchase`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash, txBoc })
    });
    const purchaseData = await purchaseRes.json();
    if (!purchaseRes.ok) throw new Error(purchaseData.error || i18n.t('pass.verification_failed'));

    clearPendingGamePassTx();
    showNotification(i18n.t('pass.purchased_success'), 'success');
    navigateWithFeedback(selectedGame.page, button);
  } catch (err) {
    console.error('Game pass purchase failed:', err);
    showNotification(i18n.t('pass.purchase_failed'), 'error');
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
