import { fetchUserData, updateTopBar, getCachedUser, setCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';

const BOX_PRICE_USD = 0.15;
const BOX_ORDER = ['bronze', 'silver', 'gold'];

let user = null;
let cachedBoxStatus = null;

const mysteryBtn = document.getElementById('open-market-mystery-box-button');
const mysteryInfo = document.getElementById('mystery-box-info');
const mysteryTrack = document.getElementById('mystery-box-track');
const backBtn = document.getElementById('back-to-market-btn');

const boxRewards = {
  bronze: { points: 200, bronzeTickets: 10, xp: 1 },
  silver: { points: 300, bronzeTickets: 20, xp: 2 },
  gold: { points: 500, bronzeTickets: 20, silverTickets: 1, xp: 5 }
};

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram?.WebApp) window.Telegram.WebApp.ready();

  try {
    await ensureSessionReady();
    user = await fetchUserData();
    updateTopBar(user);
  } catch (err) {
    console.error('Failed to load mystery box page:', err);
    showNotification('Session not ready. Please reopen the mini app.', 'error');
    return;
  }

  initMysteryBoxUI();
  await refreshMysteryStatus();
});

async function ensureSessionReady() {
  const meRes = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
  if (meRes.ok) return true;

  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) return false;

  const authRes = await fetch('/api/auth/telegram', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData })
  });
  if (!authRes.ok) return false;

  const meRetry = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
  return meRetry.ok;
}

function initMysteryBoxUI() {
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = 'marketPlace.html';
    });
  }

  if (!mysteryBtn) return;
  mysteryBtn.addEventListener('click', async () => {
    try {
      if (cachedBoxStatus?.activeBox) {
        await openMysteryBox();
        return;
      }
      if (cachedBoxStatus?.nextBoxType) {
        await purchaseMysteryBox();
        return;
      }
      showNotification('All 3 rounds complete for today. Come back tomorrow!', 'info');
    } catch (err) {
      showNotification(err.message || 'Mystery box action failed', 'error');
    }
  });
}

async function fetchMysteryStatus() {
  const res = await fetch('/api/mysteryBox/status', { credentials: 'include', cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to load mystery box status');
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
    ? `Open ${activeBox.boxType.toUpperCase()} Box`
    : nextBox
      ? `Get ${nextBox.toUpperCase()} Box`
      : 'Daily Limit Reached';

  mysteryBtn.disabled = !activeBox && !nextBox;
  mysteryBtn.classList.remove('buy-ready', 'open-ready');
  if (activeBox) mysteryBtn.classList.add('open-ready');
  else if (nextBox) mysteryBtn.classList.add('buy-ready');

  const allDone = purchasedToday >= limit;
  const progressLabel = allDone
    ? `All ${totalRounds} rounds complete for today`
    : `Round ${currentRound}/${totalRounds} - ${purchasedToday}/${limit} boxes today`;

  const nextLabel = activeBox
    ? `Ready to open: ${activeBox.boxType.toUpperCase()}`
    : nextBox
      ? `Next: ${nextBox.toUpperCase()} box`
      : 'Come back tomorrow!';

  mysteryInfo.innerHTML = `
    <p>${progressLabel}</p>
    <p>${nextLabel}</p>
  `;

  if (mysteryTrack) {
    mysteryTrack.innerHTML = '';

    const roundBadge = document.createElement('div');
    roundBadge.className = 'round-badge';
    roundBadge.textContent = allDone
      ? `All ${totalRounds} rounds done`
      : `Round ${currentRound} / ${totalRounds}`;
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
  if (!tonConnectUI.wallet) throw new Error('Please connect your wallet first');

  const amountRes = await fetch(`/api/tonAmount/ton-amount?usd=${BOX_PRICE_USD}`, { credentials: 'include' });
  const amountData = await amountRes.json();
  if (!amountRes.ok) throw new Error(amountData.error || 'Failed to get TON amount');

  const { tonAmount, recipientAddress } = amountData;
  if (!recipientAddress) throw new Error('Payment recipient not configured');

  const tx = await tonConnectUI.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [{ address: recipientAddress, amount: (tonAmount * 1e9).toFixed(0) }]
  });

  const txHash = tx?.transaction?.hash || tx?.txid?.hash || tx?.hash || '';
  const txBoc = tx?.boc || '';
  if (!txHash && !txBoc) throw new Error('Transaction proof missing');

  const purchaseRes = await fetch('/api/mysteryBox/purchase', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash, txBoc })
  });
  const data = await purchaseRes.json();
  if (!purchaseRes.ok) throw new Error(data.error || 'Purchase failed');

  showNotification(`${data.boxType.toUpperCase()} box purchased`, 'success');
  await refreshMysteryStatus();
}

async function openMysteryBox() {
  const openRes = await fetch('/api/boxes/open', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await openRes.json();
  if (!openRes.ok) throw new Error(data.error || 'Failed to open box');

  const reward = data.reward || boxRewards[data.boxType] || {};
  if (typeof window.fireConfetti === 'function') {
    window.fireConfetti({ particleCount: 110, spread: 78, origin: { y: 0.62 } });
  }

  if (typeof window.showRewardPopup === 'function') {
    window.showRewardPopup(reward, { title: `${String(data.boxType || '').toUpperCase()} Box Reward` });
  } else {
    showNotification('Box opened! Rewards added.', 'success');
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
