// home.js
import { updateTopBar } from './userData.js';
import { tonConnectUI } from './tonconnect.js';

const MINING_DURATION_MS = 6 * 60 * 60 * 1000;
let miningInterval = null;

const miningBar = document.getElementById('mining-progress');
const miningBtn = document.getElementById('farm-btn');

function updateWeeklyDropEligibility(user) {
  const btn = document.getElementById('go-to-weekly-contest');
  if (!btn || !user) return;

  const isBelieverOrAbove = [
    'Believer', 'Challenger', 'Navigator', 'Ascender',
    'Master', 'Grandmaster', 'Legend', 'Eldrin'
  ].includes(user.level);

  const hasPerfectStreak = (user.streak || 0) >= 10;
  const hasGold = (user.goldTickets || 0) >= 10;

  if (isBelieverOrAbove && hasPerfectStreak && hasGold) {
    btn.disabled = false;
    btn.textContent = 'Enter Weekly Drop';
    btn.onclick = () => { window.location.href = 'weeklyDrop.html'; };
  } else {
    btn.disabled = true;
    btn.textContent = 'Weekly Drop (Locked)';
  }
}

async function bootstrap() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) {
      window.location.replace('/auth');
      return;
    }
    await fetchUser();
  } catch (err) {
    console.error('Bootstrap failed:', err);
    window.location.replace('/auth');
  }
}

async function fetchUser() {
  try {
    const res = await fetch('/api/user/me', { credentials: 'include' });
    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = '/auth';
        return;
      }
      throw new Error('Failed to fetch user');
    }

    const data = await res.json();
    updateTopBar(data.user);
    updateUI(data.user);
    updateWeeklyDropEligibility(data.user);
    syncMiningUI(data.user.miningStartedAt);
  } catch (err) {
    console.error('Failed to load user:', err);
  }
}

function updateUI(user) {
  if (!user) return;

  document.getElementById('points-display').textContent = user.points ?? 0;
  document.getElementById('streak').textContent = user.streak ?? 0;
  document.getElementById('current-level').textContent = user.level;
  document.getElementById('bronze-tickets').innerHTML = `<i data-lucide="award"></i> ${user.bronzeTickets ?? 0}`;
  document.getElementById('silver-tickets').innerHTML = `<i data-lucide="award"></i> ${user.silverTickets ?? 0}`;
  document.getElementById('gold-tickets').innerHTML = `<i data-lucide="award"></i> ${user.goldTickets ?? 0}`;
  lucide.createIcons();
}

function syncMiningUI(miningStartedAt) {
  if (miningInterval) clearInterval(miningInterval);

  if (!miningStartedAt) {
    resetMiningUI();
    return;
  }

  const startTime = new Date(miningStartedAt).getTime();

  function update() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / MINING_DURATION_MS, 1);

    miningBar.style.width = `${progress * 100}%`;

    if (progress >= 1) {
      miningBtn.textContent = 'Claim';
      miningBtn.style.background = 'linear-gradient(90deg, #00ff00, #00ffaa)';
      miningBtn.style.boxShadow = '0 0 10px #00ff00';
      if (miningInterval) clearInterval(miningInterval);
    } else {
      miningBtn.textContent = 'Mining...';
    }
  }

  update();
  miningInterval = setInterval(update, 1000);
}

function resetMiningUI() {
  if (miningInterval) clearInterval(miningInterval);
  miningBar.style.width = '0%';
  miningBtn.textContent = 'Start Mining';
  miningBtn.style.background = '';
  miningBtn.style.boxShadow = '';
}

async function startMining() {
  try {
    const res = await fetch('/api/mining/start', { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start mining');
    syncMiningUI(data.miningStartedAt);
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

async function claimMining() {
  try {
    const res = await fetch('/api/mining/claim', { method: 'POST', credentials: 'include' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Claim failed');

    alert('+250 points!');
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    resetMiningUI();
    fetchUser();
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

const DAILY_CHECKIN_USD = 0.3;

async function handleCheckIn(button) {
  if (!tonConnectUI.wallet) {
    alert('Please connect your TON wallet first');
    return;
  }

  button.disabled = true;
  button.textContent = 'Waiting for payment...';

  try {
    const priceRes = await fetch('/api/tonAmount/ton-amount', { credentials: 'include' });
    if (!priceRes.ok) throw new Error('Failed to get TON amount');
    const { tonAmount } = await priceRes.json();

    const tx = await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: window.APP_WALLET_ADDRESS,
          amount: (tonAmount * 1e9).toFixed(0)
        }
      ]
    });

    if (!tx?.boc) throw new Error('Transaction rejected');

    const storeRes = await fetch('/api/transactions', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash: tx.boc, purpose: 'daily-checkin', expectedUsd: DAILY_CHECKIN_USD })
    });

    if (!storeRes.ok) {
      const err = await storeRes.json();
      throw new Error(err.error || 'Failed to record transaction');
    }

    alert('Check-in submitted. Awaiting confirmation.');
    fetchUser();
  } catch (err) {
    console.error('Daily check-in failed:', err);
    alert(err.message || 'Check-in failed');
  } finally {
    button.disabled = false;
    button.textContent = 'Check In';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
  }

  bootstrap();

  const checkInBtn = document.getElementById('check-in-button');
  if (checkInBtn) checkInBtn.addEventListener('click', () => handleCheckIn(checkInBtn));

  if (miningBtn) {
    miningBtn.addEventListener('click', () => {
      if (miningBtn.textContent === 'Claim') claimMining();
      else startMining();
    });
  }
});
