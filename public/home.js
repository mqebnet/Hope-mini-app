// home.js
import { updateTopBar } from './userData.js';

const MINING_DURATION_MS = 60 * 60 * 1000; // 1 hour
let miningInterval = null;
let miningTimer = null;
let miningData = null;

const miningBar = document.getElementById("mining-progress");
const miningBtn = document.getElementById("farm-btn");


/* =======================
   FETCH AUTHENTICATED USER
======================= */
async function fetchUser() {
  try {
    const res = await fetch('/api/user/me', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`
      }
    });
    function updateWeeklyDropEligibility(user) {
  const btn = document.getElementById("go-to-weekly-contest");
  if (!btn || !user) return;

  const level = getCurrentLevel(user.points || 0);
  const isBelieverOrAbove = level.name === "Believer" || [
    "Challenger","Navigator","Ascender","Master",
    "Grandmaster","Legend","Eldrin"
  ].includes(level.name);

  const hasPerfectStreak = (user.streak || 0) >= 10;
  const hasGold = (user.goldTickets || 0) >= 10;

  if (isBelieverOrAbove && hasPerfectStreak && hasGold) {
    btn.disabled = false;
    btn.textContent = "Enter Weekly Drop";
    btn.onclick = () => window.location.href = "weeklyDrop.html";
  } else {
    btn.disabled = true;
    btn.textContent = "Weekly Drop (Locked)";
  }
}

    if (!res.ok) throw new Error('Unauthorized');

    const data = await res.json();
    updateTopBar(data.user);
    updateUI(data.user);
    updateWeeklyDropEligibility(data.user);
syncMiningUI(data.user.miningStartedAt);

  } catch (err) {
    console.error('Failed to load user:', err);
    // Optional: redirect to auth
    window.location.href = '/auth';
  }
}

/* =======================
   UI UPDATE
======================= */
function updateUI(user) {
  if (!user) return;

  document.getElementById("points-display").textContent = user.points ?? 0;
  document.getElementById("streak").textContent = user.streak ?? 0;
  document.getElementById("current-level").textContent = user.level;
  document.getElementById("bronze-tickets").innerHTML =
    `<i data-lucide="award"></i> ${user.bronzeTickets ?? 0}`;
  document.getElementById("silver-tickets").innerHTML =
    `<i data-lucide="award"></i> ${user.silverTickets ?? 0}`;
  document.getElementById("gold-tickets").innerHTML =
    `<i data-lucide="award"></i> ${user.goldTickets ?? 0}`;

  lucide.createIcons();
}

function syncMiningUI(miningStartedAt) {
  clearInterval(miningInterval);

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
      miningBtn.textContent = "Claim";
      clearInterval(miningInterval);
    } else {
      miningBtn.textContent = "Mining...";
    }
  }

  update();
  miningInterval = setInterval(update, 1000);
}


function resetMiningUI() {
  clearInterval(miningInterval);
  miningBar.style.width = "0%";
  miningBtn.textContent = "Start Mining";
}

async function startMining() {
  try {
    const res = await fetch('/api/start-mining', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`
      }
    });

  const data = await res.json();
    if (!res.ok) throw new Error('Failed to start mining');

    syncMiningUI(data.miningStartedAt, data.durationMs); 

  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}


async function claimMining() {
  try {
    const res = await fetch('/api/claim-mining', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Claim failed');

    alert(`+250 points! 🎉`);
    resetMiningUI();
    fetchUser();
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}


/* =======================
   DAILY CHECK-IN
======================= */
import { tonConnectUI } from './tonconnect.js';

const DAILY_CHECKIN_USD = 0.3;

async function handleCheckIn(button) {
  if (!tonConnectUI.wallet) {
    alert('Please connect your TON wallet first');
    return;
  }

  button.disabled = true;
  button.textContent = 'Waiting for payment...';

  try {
    // 1️⃣ Ask backend how much TON is required
    const priceRes = await fetch('/api/tonAmount?usd=' + DAILY_CHECKIN_USD, {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`
      }
    });

    if (!priceRes.ok) throw new Error('Failed to get TON amount');

    const { tonAmount } = await priceRes.json();

    // 2️⃣ Request TON payment
    const tx = await tonConnectUI.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 300,
      messages: [
        {
          address: process.env.APP_WALLET_ADDRESS || window.APP_WALLET_ADDRESS,
          amount: (tonAmount * 1e9).toFixed(0)
        }
      ]
    });

    if (!tx?.boc) {
      throw new Error('Transaction rejected');
    }

    // 3️⃣ Record transaction intent
    const storeRes = await fetch('/api/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('jwt')}`
      },
      body: JSON.stringify({
        txHash: tx.boc,
        purpose: 'daily-checkin',
        expectedUsd: DAILY_CHECKIN_USD
      })
    });

    if (!storeRes.ok) {
      const err = await storeRes.json();
      throw new Error(err.error || 'Failed to record transaction');
    }

    alert('⏳ Check-in submitted. Awaiting confirmation.');
    fetchUser(); // refresh UI (streak updates after verification)

  } catch (err) {
    console.error('Daily check-in failed:', err);
    alert(err.message || 'Check-in failed');
  } finally {
    button.disabled = false;
    button.textContent = '✅ Check In';
  }
}

/* =======================
   INIT
======================= */
document.addEventListener("DOMContentLoaded", () => {
  // Telegram WebApp bootstrap
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
  }

  fetchUser();

  const checkInBtn = document.getElementById("check-in-button");
  if (checkInBtn) {
    checkInBtn.addEventListener("click", () => handleCheckIn(checkInBtn));
  }

  miningBtn.addEventListener("click", () => {
  if (miningBtn.textContent === "Claim") {
    claimMining();
  } else {
    startMining();
  }
});

});
