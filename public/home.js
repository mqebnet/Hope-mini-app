// home.js
import { updateTopBar, formatPoints } from './userData.js';
import { tonConnectUI } from './tonconnect.js';

const MINING_DURATION_MS = 6 * 60 * 60 * 1000;
let miningInterval = null;
let miningCompletionTimeout = null;
let miningAnimationFrame = null;

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
    const res = await fetch('/api/user/me', { credentials: 'include', cache: 'no-store' });
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

  const currentFormatted = formatPoints(user.points ?? 0);
  const maxFormatted = formatPoints(user.nextLevelAt || 50000);
  document.getElementById('points-display').textContent = `${currentFormatted}/${maxFormatted}`;
  document.getElementById('streak').textContent = user.streak ?? 0;
  document.getElementById('current-level').textContent = user.level;
  document.getElementById('bronze-tickets').innerHTML = `<i data-lucide="award"></i> ${user.bronzeTickets ?? 0}`;
  document.getElementById('silver-tickets').innerHTML = `<i data-lucide="award"></i> ${user.silverTickets ?? 0}`;
  document.getElementById('gold-tickets').innerHTML = `<i data-lucide="award"></i> ${user.goldTickets ?? 0}`;
  lucide.createIcons();
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

  if (progress >= 1) {
    setMiningCompleteUI();
    return;
  }

  miningBtn.textContent = 'Mining...';
  miningBtn.classList.remove('mining-ready');
  const miningTrack = document.getElementById('mining-bar');
  if (miningTrack) miningTrack.classList.add('mining-active');

  miningInterval = setInterval(() => {
    if (Date.now() - startTime >= MINING_DURATION_MS) {
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

    alert('+250 points!');
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    resetMiningUI();
    fetchUser();
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

async function handleCheckIn(button) {
  if (!tonConnectUI.wallet) {
    alert('Please connect your TON wallet first');
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Waiting for payment...';

  try {
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

    if (!tx?.boc) throw new Error('Transaction rejected');

    const verifyRes = await fetch('/api/dailyCheckIn/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ txHash: tx.boc })
    });

    if (!verifyRes.ok) {
      const err = await verifyRes.json();
      throw new Error(err.error || 'Failed to record transaction');
    }

    const verifyData = await verifyRes.json();
    const reward = verifyData.reward || { points: 1000, bronzeTickets: 100, xp: 5 };
    alert(`Check-in successful! +${reward.points} points, +${reward.bronzeTickets} bronze, +${reward.xp} XP`);
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
      if (miningBtn.textContent === 'Claim') claimMining();
      else startMining();
    });
  }
});
