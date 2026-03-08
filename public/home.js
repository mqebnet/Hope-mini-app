// home.js
import { updateTopBar, formatPoints, formatCompact, fetchUserDataOnce, getCachedUser, setCachedUser, invalidateCache } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { canBootstrap } from './utils.js';

const MINING_DURATION_MS = 6 * 60 * 60 * 1000;
let miningInterval = null;
let miningCompletionTimeout = null;
let miningAnimationFrame = null;
let miningIsComplete = false;

const miningBar = document.getElementById('mining-progress');
const miningBtn = document.getElementById('farm-btn');
const checkInBtn = document.getElementById('check-in-button');
const dailyCheckInModal = document.getElementById('daily-checkin-modal');
const dailyCheckInClose = document.getElementById('daily-checkin-close');
const dailyCheckInModalBtn = document.getElementById('daily-checkin-modal-btn');
const dailyCheckInCalendar = document.getElementById('daily-checkin-calendar');
const dailyCheckInStreakText = document.getElementById('daily-checkin-streak-text');
const dailyCheckInResetTime = document.getElementById('daily-checkin-reset-time');
let dailyCheckInStatus = null;

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
  // Bootstrap lock: prevent running twice
  if (!canBootstrap('home')) return;

  try {
    // Check if authenticated by pinging /api/me
    const sessionRes = await fetch('/api/me', { credentials: 'include' });
    if (!sessionRes.ok) {
      window.location.replace('/auth');
      return;
    }

    // Get user data from cache (populated by script.js auth flow)
    // If not cached yet, fetch it
    let user = getCachedUser();
    if (!user) {
      user = await fetchUserDataOnce();
    }

    if (user) {
      updateUI(user);
      updateTopBar(user);
      updateWeeklyDropEligibility(user);
      syncMiningUI(user.miningStartedAt);
    }
  } catch (err) {
    console.error('Bootstrap failed:', err);
    window.location.replace('/auth');
  }
}

// Handler for real-time WebSocket user data updates
// Called when server pushes user balance changes (mining, tasks, etc.)
window.onUserDataUpdate = function(user) {
  if (!user) return;
  const mergedUser = { ...(getCachedUser() || {}), ...user };
  setCachedUser(mergedUser);

  // Update DOM elements with new data
  updateUI(mergedUser);
  updateTopBar(mergedUser);
  updateWeeklyDropEligibility(mergedUser);

  // If mining just completed, sync the progress bar
  if (mergedUser.miningStartedAt) {
    syncMiningUI(mergedUser.miningStartedAt);
  } else if (!mergedUser.miningStartedAt && miningIsComplete) {
    // Mining was just claimed (cleared), reset UI
    resetMiningUI();
  }

  console.log('[Home] User data synced via WebSocket');
};

async function fetchUser(options = {}) {
  const force = Boolean(options.force);
  try {
    // Use cached user data first, fallback to API only if needed
    let user = null;
    if (!force) user = getCachedUser();

    if (!user) {
      if (force) invalidateCache();
      user = await fetchUserDataOnce();
      if (user) setCachedUser(user);
    }

    if (!user) {
      throw new Error('Failed to fetch user');
    }

    updateTopBar(user);
    updateUI(user);
    updateWeeklyDropEligibility(user);
    syncMiningUI(user.miningStartedAt);
  } catch (err) {
    console.error('Failed to load user:', err);
    if (err.message?.includes('401')) {
      window.location.href = '/auth';
    }
  }
}

function updateUI(user) {
  if (!user) return;

  const currentFormatted = formatPoints(user.points ?? 0);
  const maxFormatted = formatPoints(user.nextLevelAt || 50000);
  document.getElementById('points-display').textContent = `${currentFormatted}/${maxFormatted}`;
  document.getElementById('streak').textContent = user.streak ?? 0;
  document.getElementById('current-level').textContent = user.level;
  document.getElementById('bronze-tickets').textContent = formatCompact(user.bronzeTickets ?? 0);
  document.getElementById('silver-tickets').textContent = formatCompact(user.silverTickets ?? 0);
  document.getElementById('gold-tickets').textContent = formatCompact(user.goldTickets ?? 0);
}

function formatUtcTime(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '00:02';
  const h = String(d.getUTCHours()).padStart(2, '0');
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function setDailyCheckInButtonState(status) {
  if (!dailyCheckInModalBtn) return;
  const done = Boolean(status?.checkedInToday);
  dailyCheckInModalBtn.disabled = done;
  dailyCheckInModalBtn.textContent = done ? 'Checked Today' : 'Check In';
}

function renderDailyCheckInCalendar(status) {
  if (!dailyCheckInCalendar || !status) return;
  dailyCheckInCalendar.innerHTML = '';

  (status.calendar || []).forEach((item) => {
    const cell = document.createElement('div');
    cell.className = `daily-day ${item.status || ''}`.trim();

    const date = new Date(`${item.dayKey}T00:00:00.000Z`);
    const dayNum = Number.isFinite(date.getTime()) ? date.getUTCDate() : '--';
    const dayLabel = Number.isFinite(date.getTime())
      ? date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
      : '';

    cell.innerHTML = `
      <span class="day-num">${dayNum}</span>
      <span class="day-label">${dayLabel}</span>
    `;
    dailyCheckInCalendar.appendChild(cell);
  });
}

function openDailyCheckInModal() {
  if (!dailyCheckInModal) return;
  dailyCheckInModal.classList.remove('hidden');
  dailyCheckInModal.setAttribute('aria-hidden', 'false');
}

function closeDailyCheckInModal() {
  if (!dailyCheckInModal) return;
  dailyCheckInModal.classList.add('hidden');
  dailyCheckInModal.setAttribute('aria-hidden', 'true');
}

function showCheckInSuccessAnimation(reward) {
  const points = Number(reward?.points || 1000);
  const bronze = Number(reward?.bronzeTickets || 100);
  const xp = Number(reward?.xp || 5);

  const existing = document.getElementById('checkin-success-pop');
  if (existing) existing.remove();

  const pop = document.createElement('div');
  pop.id = 'checkin-success-pop';
  pop.className = 'checkin-success-pop';
  pop.innerHTML = `
    <div class="checkin-success-card">
      <div class="checkin-success-title">Check-in Complete</div>
      <div class="checkin-success-reward"><span id="checkin-points">+0</span> Points</div>
      <div class="checkin-success-grid">
        <div class="checkin-success-pill bronze">
          <span class="pill-label">Bronze</span>
          <span id="checkin-bronze" class="pill-value">+0</span>
        </div>
        <div class="checkin-success-pill xp">
          <span class="pill-label">XP</span>
          <span id="checkin-xp" class="pill-value">+0</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(pop);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const animateCount = (el, value, durationMs = 850) => {
    if (!el) return;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / durationMs, 1);
      const current = Math.round(value * easeOutCubic(t));
      el.textContent = `+${formatCompact(current)}`;
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  animateCount(pop.querySelector('#checkin-points'), points, 900);
  animateCount(pop.querySelector('#checkin-bronze'), bronze, 780);
  animateCount(pop.querySelector('#checkin-xp'), xp, 680);

  requestAnimationFrame(() => pop.classList.add('show'));
  setTimeout(() => {
    pop.classList.remove('show');
    setTimeout(() => pop.remove(), 240);
  }, 2400);
}

async function fetchDailyCheckInStatus() {
  const res = await fetch('/api/dailyCheckIn/status', { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch daily check-in status');
  return res.json();
}

async function refreshDailyCheckInStatus({ autoOpen } = { autoOpen: false }) {
  try {
    const data = await fetchDailyCheckInStatus();
    dailyCheckInStatus = data;

    if (dailyCheckInStreakText) {
      dailyCheckInStreakText.textContent = `Current streak: ${data.streak || 0} day${(data.streak || 0) === 1 ? '' : 's'}`;
    }
    if (dailyCheckInResetTime) {
      const resetAt = formatUtcTime(data.resetAtUtc);
      dailyCheckInResetTime.textContent = `Resets daily at ${resetAt} UTC`;
    }

    renderDailyCheckInCalendar(data);
    setDailyCheckInButtonState(data);

    if (autoOpen && !data.checkedInToday && data.dayKey) {
      const seenKey = `daily-checkin-popup-seen-${data.dayKey}`;
      if (!localStorage.getItem(seenKey)) {
        localStorage.setItem(seenKey, '1');
        openDailyCheckInModal();
      }
    }
  } catch (err) {
    console.error('Daily check-in status failed:', err);
  }
}

function syncMiningUI(miningStartedAt) {
  if (miningInterval) clearInterval(miningInterval);
  if (miningCompletionTimeout) clearTimeout(miningCompletionTimeout);
  if (miningAnimationFrame) cancelAnimationFrame(miningAnimationFrame);

  if (!miningStartedAt) {
    resetMiningUI();
    return;
  }

  const startTime = new Date(miningStartedAt).getTime();
  if (!Number.isFinite(startTime)) {
    resetMiningUI();
    return;
  }

  const elapsed = Date.now() - startTime;
  const progress = Math.min(Math.max(elapsed / MINING_DURATION_MS, 0), 1);
  miningBar.style.width = `${progress * 100}%`;

  if (progress >= 1) {
    setMiningCompleteUI();
    return;
  }

  miningBtn.textContent = 'Mining...';
  miningIsComplete = false;
  miningBtn.classList.remove('mining-ready');
  const miningTrack = document.getElementById('mining-bar');
  if (miningTrack) miningTrack.classList.add('mining-active');

  miningInterval = setInterval(() => {
    const nowElapsed = Date.now() - startTime;
    const nowProgress = Math.min(Math.max(nowElapsed / MINING_DURATION_MS, 0), 1);
    miningBar.style.width = `${nowProgress * 100}%`;

    if (nowElapsed >= MINING_DURATION_MS) {
      if (miningInterval) clearInterval(miningInterval);
      setMiningCompleteUI();
    }
  }, 1000);

  const animateProgress = () => {
    const nowElapsed = Date.now() - startTime;
    const nowProgress = Math.min(Math.max(nowElapsed / MINING_DURATION_MS, 0), 1);
    miningBar.style.width = `${nowProgress * 100}%`;

    if (nowProgress >= 1) {
      setMiningCompleteUI();
      return;
    }

    miningAnimationFrame = requestAnimationFrame(animateProgress);
  };

  miningAnimationFrame = requestAnimationFrame(animateProgress);
}

function resetMiningUI() {
  if (miningInterval) clearInterval(miningInterval);
  if (miningCompletionTimeout) clearTimeout(miningCompletionTimeout);
  if (miningAnimationFrame) cancelAnimationFrame(miningAnimationFrame);
  const miningTrack = document.getElementById('mining-bar');
  if (miningTrack) miningTrack.classList.remove('mining-active');
  miningBar.style.transition = 'width 0.25s ease';
  miningBar.style.width = '0%';
  miningBtn.textContent = 'Start Mining';
  miningIsComplete = false;
  miningBtn.classList.remove('mining-ready');
}

function setMiningCompleteUI() {
  if (miningInterval) clearInterval(miningInterval);
  if (miningCompletionTimeout) clearTimeout(miningCompletionTimeout);
  if (miningAnimationFrame) cancelAnimationFrame(miningAnimationFrame);
  const miningTrack = document.getElementById('mining-bar');
  if (miningTrack) miningTrack.classList.remove('mining-active');
  miningBar.style.transition = 'width 0.3s ease';
  miningBar.style.width = '100%';
  miningBtn.textContent = 'Claim';
  miningIsComplete = true;
  miningBtn.classList.add('mining-ready');
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

    const miningReward = { points: 250 };
    if (typeof window.showRewardPopup === 'function') {
      window.showRewardPopup(miningReward, { title: 'Mining Reward Claimed', durationMs: 2600 });
    } else if (typeof window.showSuccessToast === 'function') {
      window.showSuccessToast('+250 points!');
    } else {
      alert('+250 points!');
    }
    launchMiningClaimConfetti();
    resetMiningUI();
    await fetchUser({ force: true });
  } catch (err) {
    console.error(err);
    if (typeof window.showErrorToast === 'function') {
      window.showErrorToast(err.message || 'Mining claim failed');
    } else {
      alert(err.message);
    }
  }
}

function launchMiningClaimConfetti() {
  if (typeof confetti !== 'function') return;
  const canvas = document.createElement('canvas');
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '4300';
  canvas.style.background = 'transparent';
  document.body.appendChild(canvas);

  const fire = confetti.create(canvas, { resize: true, useWorker: true });
  const palette = ['#00ffaa', '#00eaff', '#74ffd9', '#b3fff0', '#ffd166'];
  fire({
    particleCount: 90,
    spread: 75,
    startVelocity: 45,
    scalar: 0.95,
    ticks: 140,
    origin: { y: 0.62 },
    colors: palette,
    shapes: ['circle']
  });
  setTimeout(() => {
    fire({
      particleCount: 55,
      spread: 95,
      startVelocity: 38,
      scalar: 0.8,
      ticks: 120,
      origin: { y: 0.56 },
      colors: palette,
      shapes: ['circle']
    });
  }, 140);

  setTimeout(() => {
    canvas.remove();
  }, 2200);
}

async function handleCheckIn(button) {
  const originalText = button.textContent;
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
    if (!tonConnectUI.wallet) {
      throw new Error('Please connect your TON wallet first');
    }

    const status = await fetchDailyCheckInStatus();
    if (status.checkedInToday) {
      dailyCheckInStatus = status;
      setDailyCheckInButtonState(status);
      throw new Error('Already checked in today');
    }

    button.textContent = 'Waiting for payment...';
    const priceRes = await fetch('/api/tonAmount/ton-amount', { credentials: 'include' });
    if (!priceRes.ok) throw new Error('Failed to get TON amount');
    const { tonAmount, recipientAddress } = await priceRes.json();
    if (!recipientAddress) throw new Error('Payment recipient is not configured');
    if (typeof tonAmount !== 'number' || tonAmount <= 0) throw new Error('Invalid TON amount');

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

    const verifyRes = await fetch('/api/dailyCheckIn/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash, txBoc })
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json();
      throw new Error(err.error || 'Failed to record transaction');
    }

    const verifyData = await verifyRes.json();
    const reward = verifyData.reward || { points: 1000, bronzeTickets: 100, xp: 5 };
    confetti({ particleCount: 120, spread: 85, origin: { y: 0.55 } });
    if (typeof window.showRewardPopup === 'function') {
      window.showRewardPopup(reward, { title: 'Check-in Complete' });
    } else {
      showCheckInSuccessAnimation(reward);
    }
    closeDailyCheckInModal();
    await fetchUser();
    await refreshDailyCheckInStatus();
  } catch (err) {
    console.error('Daily check-in failed:', err);
    alert(err.message || 'Check-in failed');
  } finally {
    if (button === dailyCheckInModalBtn) {
      setDailyCheckInButtonState(dailyCheckInStatus);
    } else {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
  }

  bootstrap();
  refreshDailyCheckInStatus({ autoOpen: true });

  if (checkInBtn) checkInBtn.addEventListener('click', () => openDailyCheckInModal());
  if (dailyCheckInModalBtn) dailyCheckInModalBtn.addEventListener('click', () => handleCheckIn(dailyCheckInModalBtn));
  if (dailyCheckInClose) dailyCheckInClose.addEventListener('click', closeDailyCheckInModal);
  if (dailyCheckInModal) {
    dailyCheckInModal.addEventListener('click', (event) => {
      if (event.target === dailyCheckInModal) {
        closeDailyCheckInModal();
      }
    });
  }

  if (miningBtn) {
    miningBtn.addEventListener('click', () => {
      if (miningIsComplete) claimMining();
      else startMining();
    });
  }
});
