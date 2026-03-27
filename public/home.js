// home.js
import { updateTopBar, formatPoints, formatCompact, fetchUserDataOnce, getCachedUser, setCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { canBootstrap, debounceButton, navigateWithFeedback } from './utils.js';
import { i18n } from './i18n.js';

const MINING_DURATION_MS = 6 * 60 * 60 * 1000;
let miningAnimationFrame = null;
let miningIsComplete = false;
let weeklyContestEnabled = true;
let weeklyEligibilitySyncAt = 0;
let weeklyEligibilitySyncInFlight = null;
let latestWeeklyEligibility = null;
let weeklyLockNoticeInFlight = false;
const WEEKLY_ELIGIBILITY_SYNC_MS = 30000;

let miningBar = null;
let miningBtn = null;
let checkInBtn = null;
let dailyCheckInModal = null;
let dailyCheckInClose = null;
let dailyCheckInModalBtn = null;
let dailyCheckInCalendar = null;
let dailyCheckInStreakText = null;
let dailyCheckInResetTime = null;
let dailyCheckInStatus = null;
let checkInInProgress = false;
const WELCOME_BONUS_STORAGE_KEY = 'hope_welcome_bonus';
const PENDING_CHECKIN_TX_KEY = 'pendingCheckInTx';
const PENDING_CHECKIN_TX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function savePendingCheckInTx(txHash, txBoc) {
  try {
    localStorage.setItem(PENDING_CHECKIN_TX_KEY, JSON.stringify({
      txHash: txHash || '',
      txBoc: txBoc || '',
      timestamp: Date.now()
    }));
  } catch (err) {
    console.warn('Failed to persist pending check-in transaction:', err);
  }
}

function clearPendingCheckInTx() {
  try {
    localStorage.removeItem(PENDING_CHECKIN_TX_KEY);
  } catch (err) {
    console.warn('Failed to clear pending check-in transaction:', err);
  }
}

function loadPendingCheckInTx() {
  try {
    const raw = localStorage.getItem(PENDING_CHECKIN_TX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const timestamp = Number(parsed?.timestamp || 0);
    const txHash = typeof parsed?.txHash === 'string' ? parsed.txHash.trim() : '';
    const txBoc = typeof parsed?.txBoc === 'string' ? parsed.txBoc.trim() : '';
    if (!txHash && !txBoc) {
      clearPendingCheckInTx();
      return null;
    }
    if (!Number.isFinite(timestamp) || Date.now() - timestamp > PENDING_CHECKIN_TX_MAX_AGE_MS) {
      clearPendingCheckInTx();
      return null;
    }
    return { txHash, txBoc, timestamp };
  } catch (err) {
    console.warn('Failed to parse pending check-in transaction:', err);
    clearPendingCheckInTx();
    return null;
  }
}

async function verifyDailyCheckInTx(txHash, txBoc) {
  const verifyRes = await fetch('/api/dailyCheckIn/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash, txBoc })
  });

  let data = {};
  try {
    data = await verifyRes.json();
  } catch (_) {
    data = {};
  }

  if (!verifyRes.ok) {
    const err = new Error(data.error || 'Failed to record transaction');
    err.serverError = String(data.error || '');
    throw err;
  }

  return data;
}

async function retryPendingCheckInVerification() {
  const pending = loadPendingCheckInTx();
  if (!pending) return;

  try {
    const status = await fetchDailyCheckInStatus();
    if (status?.checkedInToday) {
      clearPendingCheckInTx();
      return;
    }
  } catch (_) {
    // Continue retry attempt even if status refresh fails.
  }

  try {
    await verifyDailyCheckInTx(pending.txHash, pending.txBoc);
    clearPendingCheckInTx();
    await fetchUser();
    await refreshDailyCheckInStatus();
  } catch (err) {
    const message = (err?.serverError || err?.message || '').toLowerCase();
    if (message.includes('already checked in')) {
      clearPendingCheckInTx();
      await refreshDailyCheckInStatus();
      return;
    }
    console.warn('Pending daily check-in verification retry failed:', err);
  }
}

function setWeeklyDropButtonState(btn, label, enabled, onClick = null, options = {}) {
  const { allowInteraction = false, lockReason = '' } = options;
  const labelEl = btn.querySelector('span') || btn;
  labelEl.textContent = label;
  btn.disabled = !(enabled || allowInteraction);
  btn.onclick = null;
  btn.classList.toggle('weekly-drop-ready', enabled);
  btn.classList.toggle('weekly-drop-faded', !enabled);
  btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');

  if (!enabled && lockReason) {
    btn.title = lockReason;
  } else {
    btn.removeAttribute('title');
  }

  if ((enabled || allowInteraction) && typeof onClick === 'function') {
    btn.onclick = onClick;
  }
}

function showWeeklyDropNotice(message, type = 'info') {
  const text = String(message || '').trim();
  if (!text) return;
  if (typeof window.showNotification === 'function') {
    window.showNotification(text, type);
    return;
  }
  alert(text);
}

function getWeeklyDropLockReason(user) {
  const serverReason = String(latestWeeklyEligibility?.reason || '').trim();
  if (serverReason) return serverReason;

  if (!weeklyContestEnabled || latestWeeklyEligibility?.disabled) {
    return i18n.t('weekly.disabled_status');
  }

  const isBelieverOrAbove = [
    'Believer', 'Challenger', 'Navigator', 'Ascender',
    'Master', 'Grandmaster', 'Legend', 'Eldrin'
  ].includes(user?.level);
  const hasPerfectStreak = Number(user?.streak || 0) >= 10;
  const hasGold = Number(user?.goldTickets || 0) >= 10;
  const hasWallet = String(user?.wallet || '').trim().length > 0;

  const missing = [];
  if (!isBelieverOrAbove) missing.push('Reach Believer level or higher.');
  if (!hasPerfectStreak) missing.push(`Maintain a 10-day streak (current: ${Number(user?.streak || 0)}/10).`);
  if (!hasGold) missing.push(`Need at least 10 Gold tickets (current: ${Number(user?.goldTickets || 0)}/10).`);
  if (!hasWallet) missing.push('Connect a TON wallet to receive prizes.');

  if (!missing.length) return i18n.t('weekly.not_eligible');
  return `Weekly Drop locked: ${missing.join(' ')}`;
}

async function onWeeklyDropLockedClick(btn, fallbackUser) {
  if (weeklyLockNoticeInFlight) return;
  weeklyLockNoticeInFlight = true;
  try {
    await syncWeeklyContestEnabled({ force: true });
    const user = getCachedUser() || fallbackUser;
    const state = updateWeeklyDropEligibility(user);
    if (state === 'ready') {
      navigateWithFeedback('weeklyDrop.html', btn);
      return;
    }
    const reason = getWeeklyDropLockReason(user);
    const isDisabled = Boolean(latestWeeklyEligibility?.disabled) || !weeklyContestEnabled;
    showWeeklyDropNotice(reason, isDisabled ? 'warn' : 'info');
  } catch (err) {
    console.warn('Weekly drop lock check failed:', err);
    showWeeklyDropNotice(i18n.t('weekly.load_failed'), 'error');
  } finally {
    weeklyLockNoticeInFlight = false;
  }
}

function initDomRefs() {
  miningBar = document.getElementById('mining-progress');
  miningBtn = document.getElementById('farm-btn');
  checkInBtn = document.getElementById('check-in-button');
  dailyCheckInModal = document.getElementById('daily-checkin-modal');
  dailyCheckInClose = document.getElementById('daily-checkin-close');
  dailyCheckInModalBtn = document.getElementById('daily-checkin-modal-btn');
  dailyCheckInCalendar = document.getElementById('daily-checkin-calendar');
  dailyCheckInStreakText = document.getElementById('daily-checkin-streak-text');
  dailyCheckInResetTime = document.getElementById('daily-checkin-reset-time');
}

function updateWeeklyDropEligibility(user) {
  const btn = document.getElementById('go-to-weekly-contest');
  if (!btn || !user) return 'unknown';

  const isBelieverOrAbove = [
    'Believer', 'Challenger', 'Navigator', 'Ascender',
    'Master', 'Grandmaster', 'Legend', 'Eldrin'
  ].includes(user.level);

  const hasPerfectStreak = (user.streak || 0) >= 10;
  const hasGold = (user.goldTickets || 0) >= 10;
  const localEligible = isBelieverOrAbove && hasPerfectStreak && hasGold;
  const serverDisabled = Boolean(latestWeeklyEligibility?.disabled) || !weeklyContestEnabled;
  const hasServerEligibility = typeof latestWeeklyEligibility?.eligible === 'boolean';
  const eligible = !serverDisabled && (hasServerEligibility ? Boolean(latestWeeklyEligibility.eligible) : localEligible);

  if (eligible) {
    setWeeklyDropButtonState(btn, i18n.t('home.enter_weekly_drop'), true, () => {
      navigateWithFeedback('weeklyDrop.html', btn);
    });
    btn.dataset.weeklyState = 'ready';
    return 'ready';
  } else {
    const label = serverDisabled ? i18n.t('home.weekly_drop_disabled') : i18n.t('home.weekly_drop_locked');
    const lockReason = getWeeklyDropLockReason(user);
    setWeeklyDropButtonState(
      btn,
      label,
      false,
      () => onWeeklyDropLockedClick(btn, user),
      { allowInteraction: true, lockReason }
    );
    btn.dataset.weeklyState = 'locked';
    return 'locked';
  }
}

async function syncWeeklyContestEnabled(options = {}) {
  const force = Boolean(options.force);
  const now = Date.now();
  if (!force && now - weeklyEligibilitySyncAt < WEEKLY_ELIGIBILITY_SYNC_MS) {
    return weeklyContestEnabled;
  }
  if (weeklyEligibilitySyncInFlight) {
    return weeklyEligibilitySyncInFlight;
  }

  weeklyEligibilitySyncInFlight = (async () => {
    try {
      const res = await fetch('/api/weeklyDrop/eligibility', {
        credentials: 'include',
        cache: 'no-store'
      });
      if (!res.ok) return weeklyContestEnabled;
      const data = await res.json();
      latestWeeklyEligibility = data && typeof data === 'object' ? data : null;
      if (typeof data.disabled === 'boolean') {
        weeklyContestEnabled = !data.disabled;
      }
      weeklyEligibilitySyncAt = Date.now();
      return weeklyContestEnabled;
    } catch (err) {
      console.warn('Weekly contest eligibility sync failed:', err);
      return weeklyContestEnabled;
    } finally {
      weeklyEligibilitySyncInFlight = null;
    }
  })();

  return weeklyEligibilitySyncInFlight;
}

function showWelcomeBonusIfPresent() {
  let payload = null;

  try {
    payload = JSON.parse(sessionStorage.getItem(WELCOME_BONUS_STORAGE_KEY) || 'null');
  } catch (_) {
    payload = null;
  } finally {
    sessionStorage.removeItem(WELCOME_BONUS_STORAGE_KEY);
  }

  if (!payload) return;

  const amount = Number(payload.amount || 100);
  if (typeof window.fireConfetti === 'function') {
    window.fireConfetti({ particleCount: 110, spread: 82, origin: { y: 0.6 } });
  }
  if (typeof window.showSuccessToast === 'function') {
    window.showSuccessToast(`Welcome! You received ${amount} points from your friend's invite!`);
  } else {
    alert(`Welcome! You received ${amount} points from your friend's invite!`);
  }
}

async function bootstrap() {
  // Bootstrap lock: prevent running twice
  if (!canBootstrap('home')) return;

  try {
    initDomRefs();
    // Get user data from cache (populated by script.js auth flow)
    // If not cached yet, fetch it
    let user = getCachedUser();
    if (!user) {
      user = await fetchUserDataOnce();
    }

    if (user) {
      await syncWeeklyContestEnabled({ force: true });
      updateUI(user);
      updateTopBar(user);
      updateWeeklyDropEligibility(user);
      syncMiningUI(user.miningStartedAt);
      showWelcomeBonusIfPresent();
    }
  } catch (err) {
    console.error('Bootstrap failed:', err);
    window.location.replace('/auth');
  }
}

function handleUserUpdate(user) {
  if (!user) return;

  updateUI(user);
  updateTopBar(user);
  updateWeeklyDropEligibility(user);
  syncWeeklyContestEnabled().then(() => {
    const latestUser = getCachedUser() || user;
    updateWeeklyDropEligibility(latestUser);
  });

  if (user.miningStartedAt) {
    syncMiningUI(user.miningStartedAt);
  } else if (!user.miningStartedAt && miningIsComplete) {
    resetMiningUI();
  }

  console.log('[Home] User data synced via WebSocket');
}

window.addEventListener('hope:userUpdated', (event) => {
  handleUserUpdate(event.detail);
});

window.addEventListener('hope:globalEvent', (event) => {
  const detail = event.detail || {};
  if (detail.type === 'weekly_contest_toggled') {
    weeklyContestEnabled = Boolean(detail.data?.enabled);
    latestWeeklyEligibility = {
      ...(latestWeeklyEligibility || {}),
      disabled: !weeklyContestEnabled,
      eligible: false,
      reason: weeklyContestEnabled ? '' : i18n.t('weekly.disabled_status')
    };
    const user = getCachedUser();
    if (user) updateWeeklyDropEligibility(user);
  }
});

window.addEventListener('hope:languageChanged', () => {
  const user = getCachedUser();
  if (user) {
    updateWeeklyDropEligibility(user);
    syncMiningUI(user.miningStartedAt);
  }

  if (dailyCheckInStatus) {
    if (dailyCheckInStreakText) {
      dailyCheckInStreakText.textContent =
        `${i18n.t('checkin.current_streak')}: ${dailyCheckInStatus.streak || 0} ${i18n.t('home.days')}`;
    }
    if (dailyCheckInResetTime && dailyCheckInStatus.resetAtUtc) {
      dailyCheckInResetTime.textContent = i18n.format('checkin.resets_at', {
        time: formatUtcTime(dailyCheckInStatus.resetAtUtc)
      });
    }
    setDailyCheckInButtonState(dailyCheckInStatus);
  }
});

async function fetchUser(options = {}) {
  const force = Boolean(options.force);
  try {
    // Use cached user data first, fallback to API only if needed
    let user = null;
    if (!force) user = getCachedUser();

    if (!user) {
      const fresh = await fetchUserDataOnce();
      if (fresh) {
        const existing = getCachedUser() || {};
        user = { ...existing, ...fresh };
        setCachedUser(user);
      }
    }

    if (!user) {
      throw new Error('Failed to fetch user');
    }

    updateTopBar(user);
    updateUI(user);
    await syncWeeklyContestEnabled();
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
  dailyCheckInModalBtn.textContent = done
    ? i18n.t('home.checked_today')
    : i18n.t('home.check_in');
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
  const bronze = Number(reward?.bronzeTickets || 250);
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
      dailyCheckInStreakText.textContent =
        `${i18n.t('checkin.current_streak')}: ${data.streak || 0} ${i18n.t('home.days')}`;
    }
    if (dailyCheckInResetTime) {
      const resetAt = formatUtcTime(data.resetAtUtc);
      dailyCheckInResetTime.textContent = i18n.format('checkin.resets_at', { time: resetAt });
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
  if (!miningBar || !miningBtn) {
    initDomRefs();
  }
  if (!miningBar || !miningBtn) return;

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

  miningBtn.textContent = i18n.t('home.mining_in_progress');
  miningIsComplete = false;
  miningBtn.classList.remove('mining-ready');
  const miningTrack = document.getElementById('mining-bar');
  if (miningTrack) miningTrack.classList.add('mining-active');

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
  if (!miningBar || !miningBtn) {
    initDomRefs();
  }
  if (!miningBar || !miningBtn) return;

  if (miningAnimationFrame) cancelAnimationFrame(miningAnimationFrame);
  const miningTrack = document.getElementById('mining-bar');
  if (miningTrack) miningTrack.classList.remove('mining-active');
  miningBar.style.transition = 'width 0.25s ease';
  miningBar.style.width = '0%';
  miningBtn.textContent = i18n.t('home.start_mining');
  miningIsComplete = false;
  miningBtn.classList.remove('mining-ready');
}

function setMiningCompleteUI() {
  if (!miningBar || !miningBtn) {
    initDomRefs();
  }
  if (!miningBar || !miningBtn) return;

  if (miningAnimationFrame) cancelAnimationFrame(miningAnimationFrame);
  const miningTrack = document.getElementById('mining-bar');
  if (miningTrack) miningTrack.classList.remove('mining-active');
  miningBar.style.transition = 'width 0.3s ease';
  miningBar.style.width = '100%';
  miningBtn.textContent = i18n.t('home.claim');
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
  // Optimistic update — show reward immediately, confirm with server in background.
  // The mining bar is only claimable when full, so rejection is extremely rare.
  const miningReward = { points: 250 };
  if (miningBtn) {
    miningBtn.disabled = true;
    miningBtn.textContent = i18n.t('home.claiming');
  }

  // Update UI instantly — don't wait for server
  if (typeof window.showRewardPopup === 'function') {
    window.showRewardPopup(miningReward, { title: i18n.t('home.reward_title'), durationMs: 2600 });
  } else if (typeof window.showSuccessToast === 'function') {
    window.showSuccessToast('+250 points!');
  }
  if (typeof window.fireConfetti === 'function') {
    window.fireConfetti({ particleCount: 90, spread: 75, origin: { y: 0.62 } });
  }

  // Confirm with server in background
  try {
    const res = await fetch('/api/mining/claim', { method: 'POST', credentials: 'include' });
    const data = await res.json();

    if (!res.ok) {
      // Server rejected — restore mining UI and inform user
      throw new Error(data.error || 'Claim failed');
    }

    // Refresh user data silently after server confirms
    resetMiningUI();
    if (miningBtn) {
      miningBtn.disabled = false;
    }
    await fetchUser({ force: true });
  } catch (err) {
    console.error('Mining claim failed:', err);
    // Rollback: restore the mining complete state so user can try again
    setMiningCompleteUI();
    if (miningBtn) {
      miningBtn.disabled = false;
    }
    if (typeof window.showErrorToast === 'function') {
      window.showErrorToast(err.message || 'Mining claim failed — please try again');
    }
  }
}

async function handleCheckIn(button) {
  if (!debounceButton(button, 1000)) return;
  if (checkInInProgress) return;

  checkInInProgress = true;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = i18n.t('home.preparing_wallet');

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

    button.textContent = i18n.t('home.waiting_payment');
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

    savePendingCheckInTx(txHash, txBoc);
    const verifyData = await verifyDailyCheckInTx(txHash, txBoc);
    clearPendingCheckInTx();
    const reward = verifyData.reward || { points: 1000, bronzeTickets: 250, xp: 5 };
    closeDailyCheckInModal();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (typeof window.fireConfetti === 'function') {
      window.fireConfetti({ particleCount: 120, spread: 85, origin: { y: 0.55 } });
    }
    if (typeof window.showRewardPopup === 'function') {
      window.showRewardPopup(reward, { title: i18n.t('checkin.complete_title') });
    } else {
      showCheckInSuccessAnimation(reward);
    }
    await fetchUser();
    await refreshDailyCheckInStatus();
  } catch (err) {
    console.error('Daily check-in failed:', err);
    alert(err.message || 'Check-in failed');
  } finally {
    checkInInProgress = false;
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

  initDomRefs();
  (async () => {
    await bootstrap();
    await retryPendingCheckInVerification();
    await refreshDailyCheckInStatus({ autoOpen: true });
  })().catch((err) => {
    console.warn('Startup check-in recovery flow failed:', err);
    refreshDailyCheckInStatus({ autoOpen: true });
  });

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
