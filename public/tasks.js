import { fetchUserData, updateTopBar, fetchUserDataOnce, getCachedUser } from './userData.js';
import { tonConnectUI } from './tonconnect.js';
import { canBootstrap, debounceButton } from './utils.js';

const VERIFY_DELAY_MS = 24 * 60 * 60 * 1000;

let currentUser = null;
let taskDefinitions = null;
let dailyCheckInCheckedToday = false;
let pendingVerifications = {};
let countdownTimers = {};

window.addEventListener('hope:userUpdated', (event) => {
  const user = event.detail;
  if (!user) return;
  updateTopBar(user);
});

window.addEventListener('hope:globalEvent', (event) => {
  const detail = event.detail || {};
  if (detail.type !== 'tasks_updated') return;
  const data = detail.data || {};
  if (!data.daily || !data.oneTime) return;
  if (!currentUser) return;
  taskDefinitions = data;
  renderAllTasks();
  startCountdowns();
});

document.addEventListener('DOMContentLoaded', async () => {
  if (!canBootstrap('tasks')) return;

  try {
    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    let user = getCachedUser();
    if (!user) user = await fetchUserDataOnce();

    updateTopBar(user);

    const [definitions, checkInStatus, pendingRes] = await Promise.all([
      fetchTaskDefinitions(),
      fetchDailyCheckInStatus(),
      fetchPendingVerifications()
    ]);

    taskDefinitions = definitions;
    currentUser = user;
    dailyCheckInCheckedToday = Boolean(checkInStatus?.checkedInToday);

    (pendingRes.pending || []).forEach((p) => {
      pendingVerifications[p.taskId] = p.readyAt;
    });

    setupTabs();
    renderAllTasks();
    startCountdowns();
    setupGlobalHandlers();
  } catch (err) {
    console.error('Tasks init failed:', err);
    showErrorToast('Failed to load tasks');
  }
});

async function fetchTaskDefinitions() {
  const res = await fetch('/api/tasks/definitions', {
    credentials: 'include',
    cache: 'no-store'
  });
  if (!res.ok) throw new Error('Failed to fetch task definitions');
  return res.json();
}

async function fetchDailyCheckInStatus() {
  const res = await fetch('/api/dailyCheckIn/status', {
    credentials: 'include',
    cache: 'no-store'
  });
  if (!res.ok) throw new Error('Failed to fetch daily check-in status');
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
    : currentUser.completedTasks?.includes(task.id);

  const isPending = !completed
    && type === 'one-time'
    && task.action === 'verify'
    && pendingVerifications[task.id] !== undefined;

  const isReadyNow = isPending && Date.now() >= pendingVerifications[task.id];

  const wrapper = document.createElement('div');
  wrapper.className = 'task-item';
  wrapper.dataset.taskId = task.id;

  let buttonHtml;
  let statusHtml = '';

  if (completed) {
    buttonHtml = '<button class="task-button disabled" disabled>Done</button>';
  } else if (type === 'one-time' && task.action === 'verify') {
    if (!isPending) {
      buttonHtml = `
        <button class="task-button"
          data-task-id="${task.id}"
          data-action="verify"
          ${task.url ? `data-url="${task.url}"` : ''}>
          Go
        </button>`;
    } else if (isReadyNow) {
      buttonHtml = `
        <button class="task-button claim-btn"
          data-task-id="${task.id}"
          data-action="claim-verify">
          Claim
        </button>`;
    } else {
      buttonHtml = '<button class="task-button disabled" disabled>Verifying...</button>';
      statusHtml = `
        <div class="verify-status" data-task-id="${task.id}">
          <span class="verify-spinner">...</span>
          <span class="verify-countdown" data-ready-at="${pendingVerifications[task.id]}">
            Calculating...
          </span>
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
      <h3>${task.title}</h3>
      <p>${task.description}</p>
    </div>
    ${buttonHtml}
    ${statusHtml}
  `;

  return wrapper;
}

function getButtonLabel(task, completed) {
  if (completed) return 'Done';
  switch (task.action) {
    case 'check-in': return 'Check In';
    case 'visit': return 'Check';
    case 'verify': return 'Go';
    default: return 'Start';
  }
}

function startCountdowns() {
  Object.values(countdownTimers).forEach(clearInterval);
  countdownTimers = {};

  document.querySelectorAll('.verify-countdown[data-ready-at]').forEach((el) => {
    const readyAt = Number(el.dataset.readyAt);
    const taskItem = el.closest('.task-item');
    const taskId = taskItem?.dataset.taskId;
    if (!taskId || !readyAt) return;

    function updateCountdown() {
      const remaining = Math.min(Math.max(readyAt - Date.now(), 0), VERIFY_DELAY_MS);
      if (remaining <= 0) {
        clearInterval(countdownTimers[taskId]);
        delete countdownTimers[taskId];
        pendingVerifications[taskId] = readyAt;
        const task = findLocalTask(taskId);
        if (task && taskItem.parentNode) {
          const newEl = createTaskElement(task, 'one-time');
          taskItem.parentNode.replaceChild(newEl, taskItem);
        }
        return;
      }

      const hrs = Math.floor(remaining / (1000 * 60 * 60));
      const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((remaining % (1000 * 60)) / 1000);
      el.textContent = `Under review - ${hrs}h ${mins}m ${secs}s remaining`;
    }

    updateCountdown();
    countdownTimers[taskId] = setInterval(updateCountdown, 1000);
  });
}

function findLocalTask(taskId) {
  if (!taskDefinitions) return null;
  return [...(taskDefinitions.daily || []), ...(taskDefinitions.oneTime || [])]
    .find((t) => t.id === taskId) || null;
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
      startCountdowns();
      return;
    }

    if (action === 'verify') {
      if (url) window.open(url, '_blank');

      btn.disabled = true;
      btn.textContent = 'Submitting...';

      const res = await fetch('/api/tasks/start-verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      const data = await res.json();

      if (!res.ok) {
        showErrorToast(data.error || 'Failed to start verification');
        btn.disabled = false;
        btn.textContent = 'Go';
        return;
      }

      pendingVerifications[taskId] = data.readyAt;
      renderAllTasks();
      startCountdowns();
      showSuccessToast('Task submitted for review. Come back in 24 hours to claim your reward.');
      return;
    }

    if (action === 'claim-verify') {
      btn.disabled = true;
      btn.textContent = 'Claiming...';

      const res = await fetch('/api/tasks/claim-verify', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      const data = await res.json();

      if (!res.ok) {
        showErrorToast(data.error || 'Claim failed');
        btn.disabled = false;
        btn.textContent = 'Claim';
        return;
      }

      delete pendingVerifications[taskId];
      await refreshUser();
      renderAllTasks();
      startCountdowns();
      showSuccessToast(`+${data.reward?.points || 0} points claimed!`);
      return;
    }

    if (action === 'visit') {
      if (url) window.open(url, '_blank');
      await completeTask(taskId);
      markButtonDone(btn);
      return;
    }
  } catch (err) {
    console.error('Task action error:', err);
    if (err?.message?.toLowerCase().includes('already checked in')) {
      showSuccessToast('You already checked in today');
      await refreshUser();
      renderAllTasks();
      startCountdowns();
      return;
    }
    showErrorToast(err?.message || 'Task failed');
  }
}

function markButtonDone(btn) {
  btn.textContent = 'Done';
  btn.classList.add('disabled');
  btn.disabled = true;
}

async function handleDailyCheckIn() {
  const preStatus = await fetchDailyCheckInStatus();
  if (preStatus?.checkedInToday) {
    dailyCheckInCheckedToday = true;
    throw new Error('Already checked in today');
  }

  if (typeof tonConnectUI.restoreConnection === 'function') {
    await tonConnectUI.restoreConnection();
  } else if (tonConnectUI.connectionRestored?.then) {
    await tonConnectUI.connectionRestored;
  }

  if (!tonConnectUI.wallet) await tonConnectUI.openModal();
  if (!tonConnectUI.wallet) throw new Error('Please connect your TON wallet first');

  const priceRes = await fetch('/api/tonAmount/ton-amount', { credentials: 'include' });
  if (!priceRes.ok) throw new Error('Failed to get TON amount');
  const { tonAmount, recipientAddress } = await priceRes.json();
  if (!recipientAddress) throw new Error('Payment recipient not configured');

  const tx = await tonConnectUI.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 300,
    messages: [{ address: recipientAddress, amount: (tonAmount * 1e9).toFixed(0) }]
  });

  const txHash = tx?.transaction?.hash || tx?.txid?.hash || tx?.hash || '';
  const txBoc = tx?.boc || '';
  if (!txHash && !txBoc) throw new Error('Transaction proof missing');

  const res = await fetch('/api/dailyCheckIn/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash, txBoc })
  });
  const data = await res.json();

  if (!res.ok) {
    if ((data?.error || '').toLowerCase().includes('already checked in')) {
      dailyCheckInCheckedToday = true;
      throw new Error('Already checked in today');
    }
    throw new Error(data.error || 'Check-in failed');
  }

  dailyCheckInCheckedToday = true;
  await refreshUser();
  showSuccessToast('Check-in successful +1000 points');
}

async function completeTask(taskId) {
  const res = await fetch('/api/tasks/complete', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Failed to complete task');
  await refreshUser();
}

async function refreshUser() {
  const [user, checkInStatus] = await Promise.all([
    fetchUserData(),
    fetchDailyCheckInStatus().catch(() => ({ checkedInToday: dailyCheckInCheckedToday }))
  ]);
  currentUser = user;
  dailyCheckInCheckedToday = Boolean(checkInStatus?.checkedInToday);
  updateTopBar(currentUser);
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
