//tasks.js
import { fetchUserData, updateTopBar } from './userData.js';
import { tonConnectUI } from './tonconnect.js';

const TASK_TYPES = {
  DAILY: 'daily',
  ONE_TIME: 'one-time'
};

let currentUser = null;
let taskDefinitions = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [definitions, user] = await Promise.all([
      fetchTaskDefinitions(),
      fetchUserData()
    ]);

    taskDefinitions = definitions;
    currentUser = user;

    updateTopBar(user);

    setupTabs();
    renderAllTasks();
    setupGlobalHandlers();
  } catch (err) {
    console.error('Tasks init failed:', err);
    showErrorToast('Failed to load tasks');
  }
});

/* =======================
   Fetching
======================= */

async function fetchTaskDefinitions() {
  const res = await fetch('/api/tasks/definitions');
  if (!res.ok) throw new Error('Failed to fetch task definitions');
  return res.json();
}

/* =======================
   Rendering
======================= */

function renderAllTasks() {
  renderDailyTasks();
  renderOneTimeTasks();
}

function renderDailyTasks() {
  const container = document.getElementById('daily-task-list');
  container.innerHTML = '';

  taskDefinitions.daily.forEach(task => {
    container.appendChild(createTaskElement(task, TASK_TYPES.DAILY));
  });
}

function renderOneTimeTasks() {
  const container = document.getElementById('one-time-task-list');
  container.innerHTML = '';

  taskDefinitions.oneTime.forEach(task => {
    container.appendChild(createTaskElement(task, TASK_TYPES.ONE_TIME));
  });
}

function createTaskElement(task, type) {
  const completed = currentUser.completedTasks?.includes(task.id);

  const wrapper = document.createElement('div');
  wrapper.className = 'task-item';
  wrapper.dataset.taskId = task.id;

  wrapper.innerHTML = `
    <div class="task-info">
      <h3>${task.title}</h3>
      <p>${task.description}</p>
      <p class="reward">+${task.reward} points</p>
    </div>

    <button class="task-button ${completed ? 'disabled' : ''}"
            data-task-id="${task.id}"
            data-action="${task.action}"
            ${task.url ? `data-url="${task.url}"` : ''}
            ${completed ? 'disabled' : ''}>
      ${getButtonLabel(task, completed)}
    </button>

    ${type === TASK_TYPES.ONE_TIME && !completed ? createVerificationFormHTML(task.id) : ''}
  `;

  return wrapper;
} 

function getButtonLabel(task, completed) {
  if (completed) return 'Done';

  switch (task.action) {
    case 'check-in': return 'Check In';
    case 'play': return 'Play';
    case 'visit': return 'Check';
    case 'verify': return 'Go';
    default: return 'Start';
  }
}

function createVerificationFormHTML(taskId) {
  return `
    <form class="verification-form hidden" data-task-id="${taskId}">
      <input type="file" name="proof" accept="image/*" required />
      <button type="submit">Submit Proof</button>
    </form>
  `;
}

/* =======================
   Tabs
======================= */

function setupTabs() {
  document.querySelectorAll('.task-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.target;

      document.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.task-section').forEach(s => s.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });
}

/* =======================
   Event Delegation
======================= */

function setupGlobalHandlers() {
  document.body.addEventListener('click', handleButtonClick);
  document.body.addEventListener('submit', handleVerificationSubmit);
}

async function handleButtonClick(e) {
  const btn = e.target.closest('.task-button');
  if (!btn || btn.disabled) return;

  const taskId = btn.dataset.taskId;
  const action = btn.dataset.action;
  const url = btn.dataset.url;

  try {
    if (action === 'check-in') {
      await handleDailyCheckIn();
    }

    if (action === 'play') {
      window.location.href = '/marketPlace.html';
      return;
    }

    if (action === 'visit' || action === 'verify') {
      window.open(url, '_blank');

      if (action === 'verify') {
        showVerificationForm(taskId);
        return;
      }

      await completeTask(taskId);
    }

    markButtonDone(btn);
  } catch (err) {
    console.error('Task action error:', err);
    showErrorToast('Task failed');
  }
}

function markButtonDone(btn) {
  btn.textContent = 'Done';
  btn.classList.add('disabled');
  btn.disabled = true;
}

/* =======================
   Daily Check-in (TON)
======================= */

async function handleDailyCheckIn() {
  if (!tonConnectUI.wallet) {
    throw new Error('Please connect your TON wallet first');
  }

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

  const res = await fetch('/api/dailyCheckIn/verify', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash: tx.boc })
  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'Check-in failed');

  await refreshUser();
  showSuccessToast('Check-in successful +1000 points');
}

/* =======================
   Complete task (no proof)
======================= */

async function completeTask(taskId) {
  const res = await fetch('/api/tasks/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId })
  });

  if (!res.ok) throw new Error('Failed to complete task');

  await refreshUser();
}

/* =======================
   Verification (one-time)
======================= */

function showVerificationForm(taskId) {
  const form = document.querySelector(`.verification-form[data-task-id="${taskId}"]`);
  if (form) form.classList.remove('hidden');
}

async function handleVerificationSubmit(e) {
  const form = e.target.closest('.verification-form');
  if (!form) return;

  e.preventDefault();

  const taskId = form.dataset.taskId;
  const formData = new FormData(form);
  formData.append('taskId', taskId);

  const res = await fetch('/api/tasks/verify-proof', {
    method: 'POST',
    body: formData
  });

  if (!res.ok) {
    showErrorToast('Verification failed');
    return;
  }

  await refreshUser();
  renderAllTasks();
  showSuccessToast('Verification submitted');
}

/* =======================
   Helpers
======================= */

async function refreshUser() {
  currentUser = await fetchUserData();
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
