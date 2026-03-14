import { fetchUserData, updateTopBar, getCachedUser, invalidateCache } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { canBootstrap } from './utils.js';

const BOX_PRICE_USD = 0.15;

let user = null;
let selectedTradeAmount = null;
let selectedTradeType = null;
let cachedBoxStatus = null;
let activeMarketTab = 'games';
let exchangeUIInitialized = false;
let refreshExchangeAvailability = null;

const mysteryBtn = document.getElementById('open-market-mystery-box-button');
const mysteryInfo = document.getElementById('mystery-box-info');
const mysteryTrack = document.getElementById('mystery-box-track');
const mysteryLauncher = document.getElementById('mystery-box-launcher');
const mysteryBackBtn = document.getElementById('mystery-box-back-button');
const gamesGrid = document.getElementById('games-grid');

const boxRewards = {
  bronze: { points: 200, bronzeTickets: 10, xp: 1 },
  silver: { points: 300, bronzeTickets: 20, xp: 2 },
  gold: { points: 500, bronzeTickets: 20, silverTickets: 1, xp: 5 }
};

document.addEventListener('DOMContentLoaded', async () => {
  // Bootstrap lock: prevent running twice
  if (!canBootstrap('marketplace')) return;

  if (window.Telegram?.WebApp) window.Telegram.WebApp.ready();
  initMarketplaceTabs();
  initMysteryLauncher();
  initMysteryBoxUI();

  try {
    const cachedUser = getCachedUser();
    if (cachedUser) {
      applyUserData(cachedUser);
    }

    const freshUser = await fetchUserData();
    applyUserData(freshUser);
  } catch (err) {
    console.error('Failed to initialize marketplace:', err);
    showNotification(err.message || 'Failed to load marketplace. Please refresh.', 'error');
  }

  setTimeout(() => {
    refreshMysteryStatus();
  }, 200);
});

window.addEventListener('hope:userUpdated', (event) => {
  applyUserData(event.detail);
});

function applyUserData(nextUser) {
  if (!nextUser) return;
  user = nextUser;
  updateTopBar(user);

  if (!exchangeUIInitialized) {
    initExchangeUI();
    exchangeUIInitialized = true;
    return;
  }

  if (typeof refreshExchangeAvailability === 'function') {
    refreshExchangeAvailability();
  }
}

function initMarketplaceTabs() {
  const tabs = document.querySelectorAll('.market-tab');
  const sections = {
    games: document.getElementById('games-section'),
    exchange: document.getElementById('exchange-section')
  };

  function activateTab(target) {
    activeMarketTab = target === 'exchange' ? 'exchange' : 'games';
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === activeMarketTab));
    Object.entries(sections).forEach(([key, section]) => {
      if (section) section.classList.toggle('active', key === activeMarketTab);
    });
    if (activeMarketTab !== 'games') hideMysteryLauncher();
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      activateTab(tab.dataset.tab);
    });
  });

  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  if (tabParam === 'exchange') {
    activateTab('exchange');
  } else {
    activateTab('games');
    if (tabParam === 'boxes' || tabParam === 'puzzles') {
      showMysteryLauncher();
    }
  }
}

function initMysteryLauncher() {
  if (mysteryBackBtn) {
    mysteryBackBtn.addEventListener('click', () => {
      hideMysteryLauncher();
      const url = new URL(window.location.href);
      url.searchParams.delete('tab');
      window.history.replaceState({}, '', url.toString());
    });
  }

  window.openMysteryBoxesPanel = () => {
    // Always show the mystery launcher, regardless of current tab
    // This ensures it works when called from the games grid
    showMysteryLauncher();
    // Make sure games tab is active
    const gamesTab = document.querySelector('.market-tab[data-tab="games"]');
    const exchangeTab = document.querySelector('.market-tab[data-tab="exchange"]');
    if (gamesTab && exchangeTab) {
      gamesTab.classList.add('active');
      exchangeTab.classList.remove('active');
    }
    const gamesSection = document.getElementById('games-section');
    const exchangeSection = document.getElementById('exchange-section');
    if (gamesSection && exchangeSection) {
      gamesSection.classList.add('active');
      exchangeSection.classList.remove('active');
    }
    activeMarketTab = 'games';
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'boxes');
    window.history.replaceState({}, '', url.toString());
  };
}

function showMysteryLauncher() {
  if (mysteryLauncher) mysteryLauncher.classList.remove('hidden');
  if (gamesGrid) gamesGrid.classList.add('hidden');
}

function hideMysteryLauncher() {
  if (mysteryLauncher) mysteryLauncher.classList.add('hidden');
  if (gamesGrid) gamesGrid.classList.remove('hidden');
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
  if (!user) return;

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

  refreshExchangeAvailability = refreshAvailability;

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

      const nextUser = await fetchUserData();
      applyUserData(nextUser);
      clearAmountSelection();
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
  mysteryBtn.classList.remove('buy-ready', 'open-ready');
  if (activeBox) mysteryBtn.classList.add('open-ready');
  else if (nextBox) mysteryBtn.classList.add('buy-ready');

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

  // Show confetti effect if available
  if (typeof confetti === 'function') {
    confetti({ particleCount: 110, spread: 78, origin: { y: 0.62 } });
  }

  // Show reward popup if function is available
  const showRewardSuccess = typeof window.showRewardPopup === 'function';
  if (showRewardSuccess) {
    window.showRewardPopup(reward, { title: `${String(data.boxType || '').toUpperCase()} Box Reward` });
  } else {
    // Fallback notification if reward popup is unavailable
    showNotification('Box opened! Rewards added.', 'success');
    console.warn('showRewardPopup function not available');
  }

  const nextUser = await fetchUserData();
  applyUserData(nextUser);
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
