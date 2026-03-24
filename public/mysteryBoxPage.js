import { fetchUserData, updateTopBar, getCachedUser, setCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { i18n } from './i18n.js';
import { navigateWithFeedback } from './utils.js';

const BOX_PRICE_USD = 0.15;
const BOX_ORDER = ['bronze', 'silver', 'gold'];

let user = null;
let cachedBoxStatus = null;

const mysteryBtn = document.getElementById('open-market-mystery-box-button');
const mysteryInfo = document.getElementById('mystery-box-info');
const mysteryTrack = document.getElementById('mystery-box-track');
const backBtn = document.getElementById('back-to-market-btn');

const boxRewards = {
  bronze: { points: 200, bronzeTickets: 50, xp: 1 },
  silver: { points: 300, bronzeTickets: 50, xp: 2 },
  gold: { points: 500, bronzeTickets: 50, silverTickets: 1, xp: 5 }
};

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram?.WebApp) window.Telegram.WebApp.ready();

  try {
    // Render top bar from cache immediately — script.js already authenticated
    const cached = getCachedUser();
    if (cached) {
      user = cached;
      updateTopBar(user);
    }

    // Fetch fresh user data and mystery status in parallel
    const [freshUser] = await Promise.all([
      fetchUserData(),
      refreshMysteryStatus()
    ]);

    user = freshUser;
    updateTopBar(user);
  } catch (err) {
    console.error('Failed to load mystery box page:', err);
    showNotification(i18n.t('mysteryBox.session_not_ready'), 'error');
    return;
  }

  initMysteryBoxUI();
});

function initMysteryBoxUI() {
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      navigateWithFeedback('marketPlace.html', backBtn);
    });
  }

  if (!mysteryBtn) return;
  mysteryBtn.addEventListener('click', async () => {
    if (mysteryBtn.disabled) return;
    mysteryBtn.disabled = true;
    try {
      if (cachedBoxStatus?.activeBox) {
        await openMysteryBox();
        return;
      }
      if (cachedBoxStatus?.nextBoxType) {
        await purchaseMysteryBox();
        return;
      }
      showNotification(i18n.t('marketplace.come_back_tomorrow'), 'info');
    } catch (err) {
      showNotification(err.message || i18n.t('marketplace.mystery_action_failed'), 'error');
    } finally {
      mysteryBtn.disabled = false;
      await refreshMysteryStatus();
    }
  });
}

async function fetchMysteryStatus() {
  const res = await fetch('/api/mysteryBox/status', { credentials: 'include', cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || i18n.t('marketplace.status_failed'));
  return data;
}

function renderMysteryStatus(status) {
  cachedBoxStatus = status;
  if (!mysteryBtn || !mysteryInfo) return;

  const purchasedToday = status.purchasedToday || 0;
  const limit = status.limit || 9;
  const nextBox = status.nextBoxType;
  const activeBox = status.activeBox;
  const currentRound = status.currentRound || 1;
  const totalRounds = status.totalRounds || 3;
  const roundBoxes = status.roundBoxes || [];

  mysteryBtn.textContent = activeBox
    ? i18n.format('marketplace.open_box', { box: activeBox.boxType.toUpperCase() })
    : nextBox
      ? i18n.format('marketplace.get_box_typed', { box: nextBox.toUpperCase() })
      : i18n.t('marketplace.daily_limit_reached');

  mysteryBtn.disabled = !activeBox && !nextBox;
  mysteryBtn.classList.remove('buy-ready', 'open-ready');
  if (activeBox) mysteryBtn.classList.add('open-ready');
  else if (nextBox) mysteryBtn.classList.add('buy-ready');

  const allDone = purchasedToday >= limit;
  const progressLabel = allDone
    ? i18n.format('marketplace.all_rounds_complete', { total: totalRounds })
    : i18n.format('marketplace.rounds_progress', {
        current: currentRound,
        total: totalRounds,
        count: purchasedToday,
        limit
      });

  const nextLabel = activeBox
    ? i18n.format('marketplace.ready_to_open', { box: activeBox.boxType.toUpperCase() })
    : nextBox
      ? i18n.format('marketplace.next_box', { box: nextBox.toUpperCase() })
      : i18n.t('marketplace.come_back_tomorrow');

  mysteryInfo.innerHTML = `
    <p>${progressLabel}</p>
    <p>${nextLabel}</p>
  `;

  if (mysteryTrack) {
    mysteryTrack.innerHTML = '';

    const roundBadge = document.createElement('div');
    roundBadge.className = 'round-badge';
    roundBadge.textContent = allDone
      ? i18n.format('marketplace.rounds_done', { total: totalRounds })
      : i18n.format('marketplace.round_badge', { current: currentRound, total: totalRounds });
    mysteryTrack.appendChild(roundBadge);

    BOX_ORDER.forEach((boxType, i) => {
      const card = document.createElement('div');
      const roundBox = roundBoxes[i];

      let state = 'locked';
      if (roundBox?.status === 'claimed') state = 'claimed';
      else if (roundBox?.status === 'purchased') state = 'ready';
      else if (!roundBox && i === roundBoxes.length && nextBox === boxType) state = 'next';

      card.className = `box-card ${boxType} ${state}`;
      card.innerHTML = `
        <span class="box-title">${boxType.toUpperCase()}</span>
        <span class="box-state">${state.toUpperCase()}</span>
      `;
      mysteryTrack.appendChild(card);
    });
  }
}

async function refreshMysteryStatus() {
  const status = await fetchMysteryStatus();
  renderMysteryStatus(status);
}

async function purchaseMysteryBox() {
  if (!tonConnectUI.wallet && typeof tonConnectUI.openModal === 'function') {
    await tonConnectUI.openModal();
  }
  if (!tonConnectUI.wallet) throw new Error(i18n.t('marketplace.wallet_required'));

  const amountRes = await fetch(`/api/tonAmount/ton-amount?usd=${BOX_PRICE_USD}`, { credentials: 'include' });
  const amountData = await amountRes.json();
  if (!amountRes.ok) throw new Error(amountData.error || i18n.t('marketplace.ton_amount_failed'));

  const { tonAmount, recipientAddress } = amountData;
  if (!recipientAddress) throw new Error(i18n.t('marketplace.recipient_not_configured'));

  const tx = await tonConnectUI.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [{ address: recipientAddress, amount: (tonAmount * 1e9).toFixed(0) }]
  });

  const txHash = tx?.transaction?.hash || tx?.txid?.hash || tx?.hash || '';
  const txBoc = tx?.boc || '';
  if (!txHash && !txBoc) throw new Error(i18n.t('marketplace.tx_proof_missing'));

  const purchaseRes = await fetch('/api/mysteryBox/purchase', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash, txBoc })
  });
  const data = await purchaseRes.json();
  if (!purchaseRes.ok) throw new Error(data.error || i18n.t('marketplace.purchase_failed'));

  showNotification(i18n.format('marketplace.box_purchased', { box: data.boxType.toUpperCase() }), 'success');
  await refreshMysteryStatus();
}

async function openMysteryBox() {
  const openRes = await fetch('/api/boxes/open', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await openRes.json();
  if (!openRes.ok) throw new Error(data.error || i18n.t('marketplace.open_failed'));

  const reward = data.reward || boxRewards[data.boxType] || {};
  if (typeof window.fireConfetti === 'function') {
    window.fireConfetti({ particleCount: 110, spread: 78, origin: { y: 0.62 } });
  }

  if (typeof window.showRewardPopup === 'function') {
    window.showRewardPopup(reward, {
      title: i18n.format('marketplace.box_reward_title', { box: String(data.boxType || '').toUpperCase() })
    });
  } else {
    showNotification(i18n.t('marketplace.box_opened'), 'success');
  }

  if (data.user) {
    const mergedUser = { ...(getCachedUser() || {}), ...data.user };
    setCachedUser(mergedUser);
    user = mergedUser;
    updateTopBar(user);
  } else {
    user = await fetchUserData();
    updateTopBar(user);
  }
  await refreshMysteryStatus();
}

function showNotification(message, type = 'info') {
  if (typeof window.showSuccessToast === 'function' && type === 'success') {
    window.showSuccessToast(message);
    return;
  }
  if (typeof window.showErrorToast === 'function' && type === 'error') {
    window.showErrorToast(message);
    return;
  }
  if (typeof window.showWarningToast === 'function' && type === 'warn') {
    window.showWarningToast(message);
    return;
  }
  alert(message);
}
