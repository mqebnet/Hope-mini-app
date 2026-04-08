import { updateTopBar, getCachedUser, setCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { canBootstrap, debounceButton, getTxProof } from './utils.js';
import { i18n } from './i18n.js';

let currentUser = null;
let taskDefinitions = null;
let dailyCheckInCheckedToday = false;
let pendingVerifications = {};
let readyToClaimTasks = {};
const PENDING_CHECKIN_TX_KEY = 'pendingCheckInTx';
const PENDING_CHECKIN_TX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const TASK_I18N_MAP = {
  'daily-checkin': {
    title: 'tasks.task_daily_checkin_title',
    description: 'tasks.task_daily_checkin_desc'
  },
  'visit-telegram': {
    title: 'tasks.task_visit_telegram_title',
    description: 'tasks.task_visit_telegram_desc'
  },
  'twitter-engage': {
    title: 'tasks.task_twitter_engage_title',
    description: 'tasks.task_twitter_engage_desc'
  },
  'watch-youtube': {
    title: 'tasks.task_watch_youtube_title',
    description: 'tasks.task_watch_youtube_desc'
  },
  'join-telegram': {
    title: 'tasks.task_join_telegram_title',
    description: 'tasks.task_join_telegram_desc'
  },
  'subscribe-youtube': {
    title: 'tasks.task_subscribe_youtube_title',
    description: 'tasks.task_subscribe_youtube_desc'
  },
  'follow-twitter': {
    title: 'tasks.task_follow_twitter_title',
    description: 'tasks.task_follow_twitter_desc'
  },
  'join-group': {
    title: 'tasks.task_join_group_title',
    description: 'tasks.task_join_group_desc'
  },
  'future-task': {
    title: 'tasks.task_future_title',
    description: 'tasks.task_future_desc'
  }
};

function getLocalizedTaskCopy(task) {
  const mapping = TASK_I18N_MAP[task?.id];
  if (!mapping) {
    return {
      title: task?.title || '',
      description: task?.description || ''
    };
  }

  const points = Number(task?.reward || 0);
  const titleCandidate = i18n.t(mapping.title);
  const descriptionCandidate = i18n.format(mapping.description, { points });

  return {
    title: titleCandidate !== mapping.title ? titleCandidate : (task?.title || ''),
    description: descriptionCandidate !== mapping.description ? descriptionCandidate : (task?.description || '')
  };
}

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
    return { txHash, txBoc };
  } catch (err) {
    console.warn('Failed to parse pending check-in transaction:', err);
    clearPendingCheckInTx();
    return null;
  }
}

async function verifyDailyCheckInTx(txHash, txBoc) {
  const res = await fetch('/api/dailyCheckIn/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash, txBoc })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || i18n.t('tasks.checkin_failed'));
    err.serverError = String(data.error || '');
    throw err;
  }
  return data;
}

async function retryPendingDailyCheckInVerification() {
  const pending = loadPendingCheckInTx();
  if (!pending) return;

  try {
    const status = await fetchDailyCheckInStatus();
    if (status?.checkedInToday) {
      dailyCheckInCheckedToday = true;
      clearPendingCheckInTx();
      return;
    }
  } catch (_) {
    // Continue retry attempt even if status refresh fails.
  }

  try {
    const data = await verifyDailyCheckInTx(pending.txHash, pending.txBoc);
    clearPendingCheckInTx();
    dailyCheckInCheckedToday = true;
    markTaskCompletedLocally('daily-checkin');
    applyUserUpdateFromTaskResponse(data);
  } catch (err) {
    const message = (err?.serverError || err?.message || '').toLowerCase();
    if (message.includes('already checked in')) {
      dailyCheckInCheckedToday = true;
      clearPendingCheckInTx();
      return;
    }
    console.warn('Pending tasks check-in verification retry failed:', err);
  }
}

window.addEventListener('hope:userUpdated', (event) => {
  const user = event.detail;
  if (!user) return;
  currentUser = { ...(currentUser || {}), ...user };
  updateTopBar(currentUser);
});

window.addEventListener('hope:globalEvent', (event) => {
  const detail = event.detail || {};
  if (detail.type !== 'tasks_updated') return;
  const data = detail.data || {};
  if (!data.daily || !data.oneTime) return;
  if (!currentUser) return;
  taskDefinitions = data;
  renderAllTasks();
});

window.addEventListener('hope:languageChanged', () => {
  if (!taskDefinitions) return;
  renderAllTasks();
});

document.addEventListener('DOMContentLoaded', async () => {
  if (!canBootstrap('tasks')) return;

  try {
    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    const user = await fetchFreshUserData();

    updateTopBar(user);

    const [definitions, checkInStatus, pendingRes] = await Promise.all([
      fetchTaskDefinitions(),
      fetchDailyCheckInStatus(),
      fetchPendingVerifications()
    ]);

    taskDefinitions = definitions;
    currentUser = user;
    dailyCheckInCheckedToday = Boolean(checkInStatus?.checkedInToday);
    await retryPendingDailyCheckInVerification();

    (pendingRes.pending || []).forEach((p) => {
      pendingVerifications[p.taskId] = p.readyAt;
    });

    setupTabs();
    renderAllTasks();
    setupGlobalHandlers();
  } catch (err) {
    console.error('Tasks init failed:', err);
    showErrorToast(i18n.t('tasks.failed_load'));
  }
});

async function fetchTaskDefinitions() {
  const res = await fetch('/api/tasks/definitions', {
    credentials: 'include',
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(i18n.t('tasks.failed_load'));
  return res.json();
}

async function fetchFreshUserData() {
  const res = await fetch('/api/user/me', {
    credentials: 'include',
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(i18n.t('tasks.failed_load'));
  const data = await res.json();
  const user = data?.user || data;
  setCachedUser(user);
  return user;
}

async function fetchDailyCheckInStatus() {
  const res = await fetch('/api/dailyCheckIn/status', {
    credentials: 'include',
    cache: 'no-store'
  });
  if (!res.ok) throw new Error(i18n.t('tasks.checkin_failed'));
  return res.json();
}

async function fetchPendingVerifications() {
  try {
    const res = await fetch('/api/tasks/pending-verifications', {
      credentials: 'include',
      cache: 'no-store'
    });
    if (!res.ok) return { pending: [] };
    return res.json();
  } catch {
    return { pending: [] };
  }
}

function renderAllTasks() {
  renderDailyTasks();
  renderOneTimeTasks();
}

function renderDailyTasks() {
  const container = document.getElementById('daily-task-list');
  container.innerHTML = '';
  taskDefinitions.daily.forEach((task) => {
    container.appendChild(createTaskElement(task, 'daily'));
  });
}

function renderOneTimeTasks() {
  const container = document.getElementById('one-time-task-list');
  container.innerHTML = '';
  taskDefinitions.oneTime.forEach((task) => {
    container.appendChild(createTaskElement(task, 'one-time'));
  });
}

function createTaskElement(task, type) {
  const completed = task.action === 'check-in'
    ? dailyCheckInCheckedToday
    : type === 'daily'
      ? currentUser.completedDailyTasksToday?.includes(task.id)
      : currentUser.completedTasks?.includes(task.id);
  const isComingSoonVerify = type === 'one-time'
    && task.action === 'verify'
    && (Boolean(task.comingSoon) || !task.url);

  const isPending = !completed
    && !isComingSoonVerify
    && type === 'one-time'
    && task.action === 'verify'
    && pendingVerifications[task.id] !== undefined;

  const isReadyNow = isPending && Date.now() >= pendingVerifications[task.id];
  const isReadyToClaim = !completed && Boolean(readyToClaimTasks[task.id]);

  const wrapper = document.createElement('div');
  wrapper.className = 'task-item';
  wrapper.dataset.taskId = task.id;
  const localized = getLocalizedTaskCopy(task);

  let buttonHtml;
  let statusHtml = '';

  if (completed) {
    buttonHtml = `<button class="task-button disabled" disabled>${i18n.t('tasks.done')}</button>`;
  } else if (isComingSoonVerify) {
    buttonHtml = `<button class="task-button disabled" disabled>${i18n.t('tasks.coming_soon')}</button>`;
  } else if (task.action === 'visit') {
    if (isReadyToClaim) {
      buttonHtml = `
        <button class="task-button claim-btn"
          data-task-id="${task.id}"
          data-action="claim-task">
          ${i18n.t('home.claim')}
        </button>`;
    } else {
      buttonHtml = `
        <button class="task-button"
          data-task-id="${task.id}"
          data-action="visit"
          ${task.url ? `data-url="${task.url}"` : ''}>
          ${getButtonLabel(task, false)}
        </button>`;
    }
  } else if (type === 'one-time' && task.action === 'verify') {
    if (!isPending) {
      buttonHtml = `
        <button class="task-button"
          data-task-id="${task.id}"
          data-action="verify"
          ${task.url ? `data-url="${task.url}"` : ''}>
          ${i18n.t('tasks.go')}
        </button>`;
    } else if (isReadyNow) {
      buttonHtml = `
        <button class="task-button claim-btn"
          data-task-id="${task.id}"
          data-action="claim-verify">
          ${i18n.t('home.claim')}
        </button>`;
    } else {
      buttonHtml = `<button class="task-button disabled" disabled>${i18n.t('tasks.verifying')}</button>`;
      statusHtml = `
        <div class="verify-status" data-task-id="${task.id}">
          <span class="verify-spinner">...</span>
          <span>${i18n.t('tasks.under_review_static')}</span>
        </div>`;
    }
  } else {
    buttonHtml = `
      <button class="task-button"
        data-task-id="${task.id}"
        data-action="${task.action}"
        ${task.url ? `data-url="${task.url}"` : ''}>
        ${getButtonLabel(task, false)}
      </button>`;
  }

  wrapper.innerHTML = `
    <div class="task-info">
      <h3>${localized.title}</h3>
      <p>${localized.description}</p>
    </div>
    ${buttonHtml}
    ${statusHtml}
  `;

  return wrapper;
}

function getButtonLabel(task, completed) {
  if (completed) return i18n.t('tasks.done');
  switch (task.action) {
    case 'check-in': return i18n.t('home.check_in');
    case 'visit': return i18n.t('tasks.check');
    case 'verify': return i18n.t('tasks.go');
    default: return i18n.t('tasks.start');
  }
}

function setupTabs() {
  document.querySelectorAll('.task-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;
      document.querySelectorAll('.task-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.task-section').forEach((s) => s.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });
}

function setupGlobalHandlers() {
  document.body.addEventListener('click', handleButtonClick);
}

async function handleButtonClick(e) {
  const btn = e.target.closest('.task-button');
  if (!btn || btn.disabled) return;
  if (!debounceButton(btn, 500)) return;

  const taskId = btn.dataset.taskId;
  const action = btn.dataset.action;
  const url = btn.dataset.url;

  try {
    if (action === 'check-in') {
      await handleDailyCheckIn();
      renderAllTasks();
      return;
    }

    if (action === 'verify') {
      if (url) window.open(url, '_blank');

      btn.disabled = true;
      btn.textContent = i18n.t('tasks.submitting');

      const res = await fetch('/api/tasks/start-verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      const data = await res.json();

      if (!res.ok) {
        showErrorToast(i18n.t('tasks.start_verify_failed'));
        btn.disabled = false;
        btn.textContent = i18n.t('tasks.go');
        return;
      }

      pendingVerifications[taskId] = data.readyAt;
      renderAllTasks();
      showSuccessToast(i18n.t('tasks.task_submitted_review'));
      return;
    }

    if (action === 'claim-verify') {
      btn.disabled = true;
      btn.textContent = i18n.t('home.claiming');

      const res = await fetch('/api/tasks/claim-verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      const data = await res.json();

      if (!res.ok) {
        showErrorToast(i18n.t('tasks.claim_failed'));
        btn.disabled = false;
        btn.textContent = i18n.t('home.claim');
        return;
      }

      delete pendingVerifications[taskId];
      markTaskCompletedLocally(taskId);
      applyUserUpdateFromTaskResponse(data);
      renderAllTasks();
      showTaskRewardPopup(data.reward);
      return;
    }

    if (action === 'visit') {
      if (url) window.open(url, '_blank');
      readyToClaimTasks[taskId] = true;
      renderAllTasks();
      showSuccessToast(i18n.t('tasks.ready_to_claim'));
      return;
    }

    if (action === 'claim-task') {
      btn.disabled = true;
      btn.textContent = i18n.t('home.claiming');
      const data = await completeTask(taskId);
      delete readyToClaimTasks[taskId];
      markTaskCompletedLocally(taskId);
      renderAllTasks();
      showTaskRewardPopup(data.reward);
      return;
    }
  } catch (err) {
    console.error('Task action error:', err);
    if (action === 'claim-task' || action === 'claim-verify' || action === 'visit' || action === 'verify') {
      renderAllTasks();
    }
    if (err?.message?.toLowerCase().includes('already checked in')) {
      showSuccessToast(i18n.t('tasks.you_already_checked_in_today'));
      await refreshUser();
      renderAllTasks();
      return;
    }
    showErrorToast(i18n.t('tasks.task_failed'));
  }
}

function markButtonDone(btn) {
  btn.textContent = i18n.t('tasks.done');
  btn.classList.add('disabled');
  btn.disabled = true;
}

async function handleDailyCheckIn() {
  const preStatus = await fetchDailyCheckInStatus();
  if (preStatus?.checkedInToday) {
    dailyCheckInCheckedToday = true;
    throw new Error(i18n.t('tasks.already_checked_in_today'));
  }

  if (typeof tonConnectUI.restoreConnection === 'function') {
    await tonConnectUI.restoreConnection();
  } else if (tonConnectUI.connectionRestored?.then) {
    await tonConnectUI.connectionRestored;
  }

  if (!tonConnectUI.wallet) await tonConnectUI.openModal();
  if (!tonConnectUI.wallet) throw new Error(i18n.t('tasks.wallet_required'));

  const priceRes = await fetch('/api/tonAmount/ton-amount', { credentials: 'include' });
  if (!priceRes.ok) throw new Error(i18n.t('tasks.ton_amount_failed'));
  const { tonAmount, recipientAddress } = await priceRes.json();
  if (!recipientAddress) throw new Error(i18n.t('tasks.recipient_not_configured'));

  const tx = await tonConnectUI.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [{ address: recipientAddress, amount: (tonAmount * 1e9).toFixed(0) }]
  });

  const { txHash, txBoc } = getTxProof(tx, 'tasks-daily-checkin');
  if (!txHash && !txBoc) throw new Error(i18n.t('tasks.tx_proof_missing'));

  savePendingCheckInTx(txHash, txBoc);
  let data;
  try {
    data = await verifyDailyCheckInTx(txHash, txBoc);
    clearPendingCheckInTx();
  } catch (err) {
    const message = (err?.serverError || err?.message || '').toLowerCase();
    if (message.includes('already checked in')) {
      dailyCheckInCheckedToday = true;
      clearPendingCheckInTx();
      throw new Error(i18n.t('tasks.already_checked_in_today'));
    }
    throw err;
  }

  dailyCheckInCheckedToday = true;
  markTaskCompletedLocally('daily-checkin');
  applyUserUpdateFromTaskResponse(data);
  showTaskRewardPopup(data.reward || { points: 1000, bronzeTickets: 250, xp: 5 }, {
    title: i18n.t('checkin.complete_title')
  });
}

async function completeTask(taskId) {
  const res = await fetch('/api/tasks/complete', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(i18n.t('tasks.complete_task_failed'));
  applyUserUpdateFromTaskResponse(data);
  return data;
}

async function refreshUser() {
  const [user, checkInStatus] = await Promise.all([
    fetchFreshUserData(),
    fetchDailyCheckInStatus().catch(() => ({ checkedInToday: dailyCheckInCheckedToday }))
  ]);
  currentUser = user;
  dailyCheckInCheckedToday = Boolean(checkInStatus?.checkedInToday);
  updateTopBar(currentUser);
}

function markTaskCompletedLocally(taskId) {
  if (!taskId || !currentUser) return;
  if (taskId === 'daily-checkin') {
    dailyCheckInCheckedToday = true;
    return;
  }

  const dailyList = Array.isArray(taskDefinitions?.daily) ? taskDefinitions.daily : [];
  const oneTimeList = Array.isArray(taskDefinitions?.oneTime) ? taskDefinitions.oneTime : [];
  const isDailyTask = dailyList.some((t) => t.id === taskId);
  const isOneTimeTask = oneTimeList.some((t) => t.id === taskId);

  if (isDailyTask) {
    const done = new Set(currentUser.completedDailyTasksToday || []);
    done.add(taskId);
    currentUser.completedDailyTasksToday = Array.from(done);
  } else if (isOneTimeTask) {
    const done = new Set(currentUser.completedTasks || []);
    done.add(taskId);
    currentUser.completedTasks = Array.from(done);
  }

  setCachedUser(currentUser);
}

function applyUserUpdateFromTaskResponse(data = {}) {
  const nextUser = {
    ...(currentUser || getCachedUser() || {}),
    ...(data.user || {})
  };
  currentUser = nextUser;
  setCachedUser(nextUser);
  updateTopBar(nextUser);
  window.dispatchEvent(new CustomEvent('hope:userUpdated', { detail: nextUser }));
}

function showSuccessToast(msg) {
  if (typeof window.showSuccessToast === 'function') {
    window.showSuccessToast(msg);
    return;
  }
  alert(msg);
}

function showErrorToast(msg) {
  if (typeof window.showErrorToast === 'function') {
    window.showErrorToast(msg);
    return;
  }
  alert(msg);
}

function showTaskRewardPopup(reward = {}, options = {}) {
  const normalizedReward = {
    points: Number(reward?.points || 0),
    xp: Number(reward?.xp || 0),
    bronzeTickets: Number(reward?.bronzeTickets || 0),
    silverTickets: Number(reward?.silverTickets || 0),
    goldTickets: Number(reward?.goldTickets || 0)
  };

  if (typeof window.showRewardPopup === 'function') {
    try {
      window.showRewardPopup(normalizedReward, options);
      return;
    } catch (err) {
      console.warn('showRewardPopup failed, using toast fallback:', err);
    }
  }

  showSuccessToast(i18n.format('tasks.points_claimed', { points: normalizedReward.points || 0 }));
}
