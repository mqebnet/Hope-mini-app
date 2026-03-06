import { fetchUserData, updateTopBar } from './userData.js';
import { tonConnectUI } from './tonconnect.js';

const BOX_PRICE_USD = 0.15;

let user = null;
let selectedTradeAmount = null;
let selectedTradeType = null;
let cachedBoxStatus = null;

const mysteryBtn = document.getElementById('open-market-mystery-box-button');
const mysteryInfo = document.getElementById('mystery-box-info');
const mysteryTrack = document.getElementById('mystery-box-track');

const boxRewards = {
  bronze: { points: 200, bronzeTickets: 10, xp: 1 },
  silver: { points: 300, bronzeTickets: 20, xp: 2 },
  gold: { points: 500, bronzeTickets: 20, silverTickets: 1, xp: 5 }
};

document.addEventListener('DOMContentLoaded', async () => {
  if (window.Telegram?.WebApp) window.Telegram.WebApp.ready();
  initMarketplaceTabs();

  try {
    await ensureSessionReady();
    user = await fetchUserDataWithRetry(8, 700);
    updateTopBar(user);
  } catch (err) {
    console.error('Failed to load user after retries:', err);
    showNotification('Session not ready. Please reopen the mini app.', 'error');
    return;
  }

  initExchangeUI();
  initMysteryBoxUI();
  await refreshMysteryStatus();
});

async function fetchUserDataWithRetry(retries = 3, delayMs = 400) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fetchUserData();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastErr || new Error('Failed to load user');
}

async function ensureSessionReady() {
  const meRes = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
  if (meRes.ok) return true;

  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) return false;

  try {
    const authRes = await fetch('/api/auth/telegram', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });
    if (!authRes.ok) return false;
  } catch (err) {
    console.error('Marketplace auth bootstrap failed:', err);
    return false;
  }

  const meRetry = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
  return meRetry.ok;
}

function initMarketplaceTabs() {
  const tabs = document.querySelectorAll('.market-tab');
  const sections = {
    games: document.getElementById('games-section'),
    puzzles: document.getElementById('puzzles-section'),
    exchange: document.getElementById('exchange-section')
  };

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.toggle('active', t === tab));
      Object.entries(sections).forEach(([key, section]) => {
        if (section) section.classList.toggle('active', key === target);
      });
    });
  });
}

function updateExchangePreview(tradeType, amount) {
  const exchangeRates = { bronze: 0.01, silver: 0.01 };
  const rate = exchangeRates[tradeType] || 1;
  const toAmount = Math.floor(amount * rate);
  const fromLabel = tradeType === 'bronze' ? 'Bronze' : 'Silver';
  const toLabel = tradeType === 'bronze' ? 'Silver' : 'Gold';

  const fromDiv = document.getElementById('from-ticket');
  const toDiv = document.getElementById('to-ticket');
  if (fromDiv) fromDiv.textContent = `${amount} ${fromLabel}`;
  if (toDiv) toDiv.textContent = `${toAmount} ${toLabel}`;
}

function initExchangeUI() {
  const typeSelect = document.getElementById('exchange-type');
  const amountButtons = document.querySelectorAll('.amount-option');
  const tradeBtn = document.getElementById('trade-button');
  if (!typeSelect || !tradeBtn || !amountButtons.length) return;

  tradeBtn.disabled = true;

  const prettyAmount = (amount) => (amount >= 1000 ? `${amount / 1000}k` : `${amount}`);
  const labelsByType = {
    bronze: 'Bronze',
    silver: 'Silver'
  };

  function clearAmountSelection() {
    amountButtons.forEach((btn) => btn.classList.remove('selected'));
  }

  function renderAmountLabels() {
    const label = labelsByType[typeSelect.value] || 'Ticket';
    amountButtons.forEach((btn) => {
      const amount = Number.parseInt(btn.dataset.amount, 10);
      btn.textContent = `${prettyAmount(amount)} ${label}`;
    });
  }

  function refreshAvailability() {
    amountButtons.forEach((btn) => {
      const amount = Number.parseInt(btn.dataset.amount, 10);
      const type = typeSelect.value;
      const balance = type === 'bronze' ? user.bronzeTickets : user.silverTickets;
      btn.disabled = balance < amount;
      btn.classList.toggle('disabled', balance < amount);
      if (btn.disabled && btn.classList.contains('selected')) {
        btn.classList.remove('selected');
      }
    });

    if (!Array.from(amountButtons).some((btn) => btn.classList.contains('selected'))) {
      selectedTradeAmount = null;
      tradeBtn.disabled = true;
    }
  }

  renderAmountLabels();
  refreshAvailability();

  typeSelect.addEventListener('change', () => {
    selectedTradeAmount = null;
    selectedTradeType = null;
    tradeBtn.disabled = true;
    clearAmountSelection();
    renderAmountLabels();
    const fromDiv = document.getElementById('from-ticket');
    const toDiv = document.getElementById('to-ticket');
    if (fromDiv) fromDiv.textContent = '';
    if (toDiv) toDiv.textContent = '';
    refreshAvailability();
  });

  amountButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) {
        showNotification('Not enough tickets', 'info');
        return;
      }
      clearAmountSelection();
      btn.classList.add('selected');
      selectedTradeAmount = Number.parseInt(btn.dataset.amount, 10);
      selectedTradeType = typeSelect.value;
      tradeBtn.disabled = false;
      updateExchangePreview(selectedTradeType, selectedTradeAmount);
    });
  });

  tradeBtn.addEventListener('click', async () => {
    if (!selectedTradeAmount) return;
    try {
      if (!tonConnectUI.wallet) throw new Error('Please connect your wallet first');
      const res = await fetch('/api/exchangeTickets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromType: selectedTradeType,
          quantity: selectedTradeAmount / 100
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trade failed');

      user = await fetchUserData();
      updateTopBar(user);
      clearAmountSelection();
      refreshAvailability();
      tradeBtn.disabled = true;
      selectedTradeAmount = null;
      selectedTradeType = null;
      const fromDiv = document.getElementById('from-ticket');
      const toDiv = document.getElementById('to-ticket');
      if (fromDiv) fromDiv.textContent = '';
      if (toDiv) toDiv.textContent = '';
      showNotification('Trade successful!', 'success');
    } catch (err) {
      showNotification(err.message || 'Trade failed', 'error');
    }
  });
}

function initMysteryBoxUI() {
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

      showNotification('Daily mystery box limit reached', 'info');
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
  const limit = status.limit || 3;
  const nextBox = status.nextBoxType;
  const activeBox = status.activeBox;
  const todayBoxes = status.todayBoxes || [];

  mysteryBtn.textContent = activeBox
    ? `Open ${activeBox.boxType.toUpperCase()} Box`
    : nextBox
      ? `Get ${nextBox.toUpperCase()} Mystery Box`
      : 'Daily Limit Reached';

  mysteryBtn.disabled = !activeBox && !nextBox;

  const progressLabel = `${purchasedToday}/${limit} purchased today`;
  const nextLabel = activeBox
    ? `Ready to open: ${activeBox.boxType}`
    : nextBox
      ? `Next box: ${nextBox}`
      : 'All 3 boxes purchased today';

  mysteryInfo.innerHTML = `
    <p>${progressLabel}</p>
    <p>${nextLabel}</p>
  `;

  if (mysteryTrack) {
    const statusMap = new Map(todayBoxes.map((b) => [b.boxType, b.status]));
    mysteryTrack.innerHTML = '';
    ['bronze', 'silver', 'gold'].forEach((boxType) => {
      const card = document.createElement('div');
      const recorded = statusMap.get(boxType);
      let state = 'locked';
      if (recorded === 'claimed') state = 'claimed';
      else if (recorded === 'purchased') state = 'ready';
      else if (nextBox === boxType) state = 'next';
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
  try {
    const status = await fetchMysteryStatus();
    renderMysteryStatus(status);
  } catch (err) {
    showNotification(err.message || 'Failed to load mystery box status', 'error');
  }
}

async function purchaseMysteryBox() {
  if (!tonConnectUI.wallet) {
    if (typeof tonConnectUI.openModal === 'function') {
      await tonConnectUI.openModal();
    }
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

  if (typeof confetti === 'function') {
    confetti({ particleCount: 110, spread: 78, origin: { y: 0.62 } });
  }

  if (typeof window.showRewardPopup === 'function') {
    window.showRewardPopup(reward, { title: `${String(data.boxType || '').toUpperCase()} Box Reward` });
  } else {
    showNotification('Box opened! Rewards added.', 'success');
  }

  user = await fetchUserData();
  updateTopBar(user);
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
