async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed: ${res.status}`);
  }
  return data;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function parseMaybeNumber(value) {
  if (value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

function parseMaybeBool(value) {
  if (value === '') return undefined;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return undefined;
}

async function loadStats() {
  try {
    const data = await api('/api/admin/stats');
    const stats = data.stats || {};
    const wrap = document.getElementById('admin-stats');
    wrap.innerHTML = [
      `<div class="admin-card"><b>Users</b><div>${stats.users ?? 0}</div></div>`,
      `<div class="admin-card"><b>Admins</b><div>${stats.admins ?? 0}</div></div>`,
      `<div class="admin-card"><b>Active Miners</b><div>${stats.activeMiners ?? 0}</div></div>`,
      `<div class="admin-card"><b>Contest Entries</b><div>${stats.contestants ?? 0}</div></div>`
    ].join('');
  } catch (err) {
    setText('admin-stats', `Error: ${err.message}`);
  }
}

async function loadUsers() {
  const search = document.getElementById('user-search').value.trim();
  try {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    const data = await api(`/api/admin/users${q}`);
    setText('users-result', data);
  } catch (err) {
    setText('users-result', `Error: ${err.message}`);
  }
}

async function updateUser() {
  const telegramId = document.getElementById('edit-telegram-id').value.trim();
  const payload = {};

  const points = parseMaybeNumber(document.getElementById('edit-points').value.trim());
  const xp = parseMaybeNumber(document.getElementById('edit-xp').value.trim());
  const streak = parseMaybeNumber(document.getElementById('edit-streak').value.trim());
  const level = document.getElementById('edit-level').value.trim();
  const isAdmin = parseMaybeBool(document.getElementById('edit-admin').value.trim());

  if (points !== undefined) payload.points = points;
  if (xp !== undefined) payload.xp = xp;
  if (streak !== undefined) payload.streak = streak;
  if (level) payload.level = level;
  if (isAdmin !== undefined) payload.isAdmin = isAdmin;

  try {
    const data = await api(`/api/admin/users/${encodeURIComponent(telegramId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    setText('update-user-result', data);
  } catch (err) {
    setText('update-user-result', `Error: ${err.message}`);
  }
}

async function loadTasks() {
  try {
    const data = await api('/api/admin/tasks');
    document.getElementById('tasks-json').value = JSON.stringify({ daily: data.daily, oneTime: data.oneTime }, null, 2);
    setText('tasks-result', 'Loaded.');
  } catch (err) {
    setText('tasks-result', `Error: ${err.message}`);
  }
}

async function saveTasks() {
  try {
    const raw = document.getElementById('tasks-json').value;
    const parsed = JSON.parse(raw);
    const data = await api('/api/admin/tasks', {
      method: 'PUT',
      body: JSON.stringify(parsed)
    });
    setText('tasks-result', data);
  } catch (err) {
    setText('tasks-result', `Error: ${err.message}`);
  }
}

async function setWeek() {
  const week = document.getElementById('contest-week').value.trim();
  try {
    const data = await api('/api/admin/contests/set-week', {
      method: 'POST',
      body: JSON.stringify({ week })
    });
    setText('contest-result', data);
  } catch (err) {
    setText('contest-result', `Error: ${err.message}`);
  }
}

async function publishResult() {
  const week = document.getElementById('result-week').value.trim();
  const winnerIdsRaw = document.getElementById('winner-ids').value.trim();
  const message = document.getElementById('result-message').value.trim();
  const winnerTelegramIds = winnerIdsRaw
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v));

  try {
    const data = await api('/api/admin/contests/results', {
      method: 'POST',
      body: JSON.stringify({ week, winnerTelegramIds, message })
    });
    setText('contest-result', data);
  } catch (err) {
    setText('contest-result', `Error: ${err.message}`);
  }
}

async function runMiningRemindersNow() {
  try {
    const data = await api('/api/admin/notifications/mining-reminders/run', {
      method: 'POST'
    });
    setText('notify-result', data);
    await loadLastMiningReminderRun();
  } catch (err) {
    setText('notify-result', `Error: ${err.message}`);
  }
}

async function loadLastMiningReminderRun() {
  try {
    const data = await api('/api/admin/notifications/mining-reminders/last-run');
    if (!data.lastRun) {
      setText('notify-last-run', 'Last run: none');
      return;
    }
    const r = data.lastRun;
    setText('notify-last-run', [
      `Last run: ${formatDateTime(r.runAt)}`,
      `Requested by: ${r.requestedBy ?? '-'}`,
      `Scanned: ${r.scanned ?? 0}, Due: ${r.due ?? 0}, Sent: ${r.sent ?? 0}, Failed: ${r.failed ?? 0}`
    ].join('\n'));
  } catch (err) {
    setText('notify-last-run', `Error loading last run: ${err.message}`);
  }
}

document.getElementById('btn-load-users').addEventListener('click', loadUsers);
document.getElementById('btn-update-user').addEventListener('click', updateUser);
document.getElementById('btn-load-tasks').addEventListener('click', loadTasks);
document.getElementById('btn-save-tasks').addEventListener('click', saveTasks);
document.getElementById('btn-set-week').addEventListener('click', setWeek);
document.getElementById('btn-publish-result').addEventListener('click', publishResult);
document.getElementById('btn-run-mining-reminders').addEventListener('click', runMiningRemindersNow);

loadStats();
loadTasks();
loadLastMiningReminderRun();
