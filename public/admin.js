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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmt(value) {
  if (value === null || value === undefined || value === '') return '-';
  return escapeHtml(String(value));
}

function fmtDate(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return fmt(iso);
  return d.toLocaleString();
}

function showResult(id, message, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('is-error', Boolean(isError));
}

function clearResult(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('is-error');
}

function parseMaybeNumber(value) {
  if (value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseMaybeBool(value) {
  if (value === '') return undefined;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return undefined;
}

let currentUsersPage = 1;
let totalUsersPages = 1;
let currentSortKey = 'createdAt';
let currentSortDir = 'desc';
let lastUsers = [];
let contestEnabled = true;
let adminRealtimeRefreshTimer = null;

function updateRealtimeStatus(detail = {}) {
  const wsConnected = Boolean(detail.wsConnected);
  const statusEl = document.getElementById('realtime-status');
  const transportEl = document.getElementById('realtime-transport');
  const socketIdEl = document.getElementById('realtime-socket-id');
  const pollingEl = document.getElementById('realtime-polling');
  const triggerEl = document.getElementById('realtime-trigger');
  if (!statusEl || !transportEl || !socketIdEl || !pollingEl || !triggerEl) return;

  statusEl.textContent = wsConnected ? 'Connected' : 'Disconnected';
  statusEl.classList.toggle('realtime-ok', wsConnected);
  statusEl.classList.toggle('realtime-bad', !wsConnected);
  transportEl.textContent = detail.transportName || '-';
  socketIdEl.textContent = detail.socketId || '-';
  pollingEl.textContent = detail.pollingActive ? 'Active' : 'Inactive';
  triggerEl.textContent = detail.trigger || '-';
}

function scheduleAdminRealtimeRefresh() {
  if (adminRealtimeRefreshTimer) clearTimeout(adminRealtimeRefreshTimer);
  adminRealtimeRefreshTimer = setTimeout(async () => {
    adminRealtimeRefreshTimer = null;
    await Promise.allSettled([
      loadStats(),
      loadUsers(currentUsersPage || 1),
      loadContestOverview(),
      loadLastMiningReminderRun()
    ]);
  }, 180);
}

function setContestToggleUI(enabled) {
  contestEnabled = Boolean(enabled);
  const statusEl = document.getElementById('contest-toggle-status');
  const btn = document.getElementById('btn-toggle-contest');
  if (statusEl) {
    statusEl.textContent = contestEnabled ? 'ENABLED' : 'DISABLED';
    statusEl.classList.toggle('off', !contestEnabled);
  }
  if (btn) {
    btn.textContent = contestEnabled ? 'Disable' : 'Enable';
    btn.classList.toggle('warn', contestEnabled);
    btn.classList.toggle('alt', !contestEnabled);
  }
}

async function loadStats() {
  try {
    const data = await api('/api/admin/stats');
    const stats = data.stats || {};
    const wrap = document.getElementById('admin-stats');
    if (wrap) {
      wrap.innerHTML = [
        `<div class="admin-card"><b>Users</b><div>${stats.users ?? 0}</div></div>`,
        `<div class="admin-card"><b>Admins</b><div>${stats.admins ?? 0}</div></div>`,
        `<div class="admin-card"><b>Active Miners</b><div>${stats.activeMiners ?? 0}</div></div>`,
        `<div class="admin-card"><b>Contest Entries</b><div>${stats.contestants ?? 0}</div></div>`
      ].join('');
    }
    if (typeof stats.weeklyContestEnabled === 'boolean') {
      setContestToggleUI(stats.weeklyContestEnabled);
    }
  } catch (err) {
    showResult('admin-stats', `Error: ${err.message}`, true);
  }
}

async function loadContestToggle() {
  try {
    const data = await api('/api/admin/contests/toggle');
    setContestToggleUI(data.enabled);
  } catch (err) {
    showResult('contest-toggle-status', `Error: ${err.message}`, true);
  }
}

function compareValues(a, b) {
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function sortUsers(users) {
  const dir = currentSortDir === 'asc' ? 1 : -1;
  return [...users].sort((a, b) => {
    const av = a?.[currentSortKey];
    const bv = b?.[currentSortKey];
    return compareValues(av, bv) * dir;
  });
}

function updateSortIndicators() {
  document.querySelectorAll('th[data-sort]')?.forEach((th) => {
    const key = th.dataset.sort;
    if (key === currentSortKey) {
      th.dataset.dir = currentSortDir;
    } else {
      delete th.dataset.dir;
    }
  });
}

function renderUsersTable(users) {
  lastUsers = Array.isArray(users) ? users : [];
  const wrap = document.getElementById('users-table-wrap');
  if (!wrap) return;

  if (!lastUsers.length) {
    wrap.innerHTML = '<p class="muted">No users found.</p>';
    return;
  }

  const sorted = sortUsers(lastUsers);
  const rows = sorted.map((u) => {
    const ticketsTitle = `B:${u.bronzeTickets || 0} S:${u.silverTickets || 0} G:${u.goldTickets || 0}`;
    const ticketsText = `B:${fmt(u.bronzeTickets)} S:${fmt(u.silverTickets)} G:${fmt(u.goldTickets)}`;
    return `
      <tr>
        <td>${fmt(u.telegramId)}</td>
        <td>${fmt(u.username)}</td>
        <td>${fmt(u.level)}</td>
        <td>${fmt(u.points?.toLocaleString?.() ?? u.points)}</td>
        <td>${fmt(u.xp)}</td>
        <td>${fmt(u.streak)}</td>
        <td>${fmt(u.transactionsCount)}</td>
        <td title="${escapeHtml(ticketsTitle)}">${ticketsText}</td>
        <td>${u.isAdmin ? '<span class="badge-admin">ADMIN</span>' : ''}</td>
        <td>${fmtDate(u.createdAt)}</td>
        <td>
          <button class="btn-sm btn-edit" onclick="prefillEdit(${u.telegramId})">Edit</button>
          <button class="btn-sm btn-reset" onclick="quickReset(${u.telegramId})">Reset</button>
        </td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="user-table">
      <thead>
        <tr>
          <th data-sort="telegramId">ID</th>
          <th data-sort="username">Username</th>
          <th data-sort="level">Level</th>
          <th data-sort="points">Points</th>
          <th data-sort="xp">XP</th>
          <th data-sort="streak">Streak</th>
          <th data-sort="transactionsCount">Transactions</th>
          <th>Tickets</th>
          <th data-sort="isAdmin">Admin</th>
          <th data-sort="createdAt">Joined</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  updateSortIndicators();
}

async function loadUsers(page = 1) {
  const search = document.getElementById('user-search').value.trim();
  const q = new URLSearchParams({ page, limit: 20 });
  if (search) q.set('search', search);

  try {
    const data = await api(`/api/admin/users?${q}`);
    const { users = [], pagination = {} } = data;

    currentUsersPage = pagination.page || 1;
    totalUsersPages = pagination.pages || 1;

    const label = document.getElementById('pagination-label');
    if (label) {
      label.textContent = `Page ${currentUsersPage} / ${totalUsersPages} (${pagination.total ?? 0} users)`;
    }

    const prevBtn = document.getElementById('btn-prev-page');
    const nextBtn = document.getElementById('btn-next-page');
    if (prevBtn) prevBtn.disabled = currentUsersPage <= 1;
    if (nextBtn) nextBtn.disabled = currentUsersPage >= totalUsersPages;

    renderUsersTable(users);
  } catch (err) {
    const wrap = document.getElementById('users-table-wrap');
    if (wrap) wrap.innerHTML = `<p class="error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function prefillEdit(telegramId) {
  document.getElementById('edit-telegram-id').value = telegramId;
  document.getElementById('edit-points').value = '';
  document.getElementById('edit-xp').value = '';
  document.getElementById('edit-streak').value = '';
  document.getElementById('edit-bronze').value = '';
  document.getElementById('edit-silver').value = '';
  document.getElementById('edit-gold').value = '';
  document.getElementById('edit-level').value = '';
  document.getElementById('edit-admin').value = '';
  document.getElementById('edit-telegram-id').scrollIntoView({ behavior: 'smooth', block: 'center' });
  clearResult('update-user-result');
}

async function updateUser() {
  const telegramId = document.getElementById('edit-telegram-id').value.trim();
  if (!telegramId) {
    alert('telegramId is required');
    return;
  }

  const payload = {};
  const p = parseMaybeNumber(document.getElementById('edit-points').value);
  const x = parseMaybeNumber(document.getElementById('edit-xp').value);
  const s = parseMaybeNumber(document.getElementById('edit-streak').value);
  const br = parseMaybeNumber(document.getElementById('edit-bronze').value);
  const si = parseMaybeNumber(document.getElementById('edit-silver').value);
  const go = parseMaybeNumber(document.getElementById('edit-gold').value);
  const lv = document.getElementById('edit-level').value.trim();
  const ad = document.getElementById('edit-admin').value.trim();

  if (p !== undefined) payload.points = p;
  if (x !== undefined) payload.xp = x;
  if (s !== undefined) payload.streak = s;
  if (br !== undefined) payload.bronzeTickets = br;
  if (si !== undefined) payload.silverTickets = si;
  if (go !== undefined) payload.goldTickets = go;
  if (lv) payload.level = lv;
  if (ad === 'true') payload.isAdmin = true;
  if (ad === 'false') payload.isAdmin = false;

  if (!Object.keys(payload).length) {
    showResult('update-user-result', 'Nothing to update - fill at least one field.', true);
    return;
  }

  try {
    const data = await api(`/api/admin/users/${encodeURIComponent(telegramId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    showResult('update-user-result', `Updated ${data.user?.username || telegramId}`);
    await loadUsers(currentUsersPage);
  } catch (err) {
    showResult('update-user-result', `Error: ${err.message}`, true);
  }
}

async function resetUser() {
  const telegramId = document.getElementById('edit-telegram-id').value.trim();
  if (!telegramId) {
    alert('Enter a telegramId first');
    return;
  }
  if (!confirm(`Reset ALL stats for user ${telegramId}? This cannot be undone.`)) return;

  try {
    const data = await api(`/api/admin/users/${encodeURIComponent(telegramId)}/reset`, {
      method: 'POST',
      body: JSON.stringify({ fields: ['points', 'xp', 'streak', 'bronzeTickets', 'silverTickets', 'goldTickets'] })
    });
    showResult('update-user-result', `Reset ${data.user?.username || telegramId}`);
    await loadUsers(currentUsersPage);
  } catch (err) {
    showResult('update-user-result', `Error: ${err.message}`, true);
  }
}

async function quickReset(telegramId) {
  if (!confirm(`Reset ALL stats for user ${telegramId}?`)) return;
  try {
    await api(`/api/admin/users/${encodeURIComponent(telegramId)}/reset`, {
      method: 'POST',
      body: JSON.stringify({ fields: ['points', 'xp', 'streak', 'bronzeTickets', 'silverTickets', 'goldTickets'] })
    });
    await loadUsers(currentUsersPage);
  } catch (err) {
    alert(`Reset failed: ${err.message}`);
  }
}

async function sendBroadcast() {
  const message = document.getElementById('broadcast-message').value.trim();
  const level = document.getElementById('broadcast-level').value;
  if (!message) {
    showResult('broadcast-result', 'Message cannot be empty.', true);
    return;
  }
  if (!confirm(`Send this message to ${level || 'ALL'} users?`)) return;

  try {
    const data = await api('/api/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify({ message, level: level || null })
    });
    showResult('broadcast-result', `Sent to ${data.sent}/${data.total} users (target: ${data.targeted})`);
  } catch (err) {
    showResult('broadcast-result', `Error: ${err.message}`, true);
  }
}

async function loadTasks() {
  try {
    const data = await api('/api/admin/tasks');
    document.getElementById('tasks-json').value =
      JSON.stringify({ daily: data.daily, oneTime: data.oneTime }, null, 2);
    showResult('tasks-result', 'Loaded');
  } catch (err) {
    showResult('tasks-result', `Error: ${err.message}`, true);
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
    showResult('tasks-result',
      `Saved and pushed live - ${(data.daily || []).length} daily, ${(data.oneTime || []).length} one-time tasks.`
    );
  } catch (err) {
    showResult('tasks-result', `Error: ${err.message}`, true);
  }
}

async function loadContestOverview() {
  try {
    const week = document.getElementById('contest-week').value.trim() || '';
    const q = week ? `?week=${encodeURIComponent(week)}` : '';
    const data = await api(`/api/admin/contests/overview${q}`);

    const rows = (data.latestEntries || []).map((e) => `
      <tr>
        <td>${fmt(e.telegramId)}</td>
        <td>${fmt(e.username)}</td>
        <td class="cell-ellipsis">${fmt(e.wallet)}</td>
        <td>${fmtDate(e.enteredAt)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="muted">No entries yet this week</td></tr>';

    document.getElementById('contest-overview').innerHTML = `
      <div class="contest-summary">
        <span>Active week: <b style="color:#00ffaa">${fmt(data.currentWeek)}</b></span>
        <span class="dot">|</span>
        <span>Viewing: <b>${fmt(data.week)}</b></span>
        <span class="dot">|</span>
        <span>Entries: <b>${fmt(data.totalEntries)}</b></span>
        <span class="dot">|</span>
        <span>Next: <b>${fmt(data.nextWeek)}</b></span>
      </div>
      <table class="entries-table">
        <thead><tr><th>Telegram ID</th><th>Username</th><th>Wallet</th><th>Entered</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${data.result ? `<div class="muted">Result published: ${fmtDate(data.result.publishedAt)}</div>` : ''}
    `;
  } catch (err) {
    document.getElementById('contest-overview').innerHTML =
      `<p class="error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function setWeek() {
  const week = document.getElementById('contest-week').value.trim();
  if (!week) {
    alert('Enter a week label');
    return;
  }
  try {
    const data = await api('/api/admin/contests/set-week', {
      method: 'POST',
      body: JSON.stringify({ week })
    });
    showResult('contest-result', `Current week set to "${data.week}"`);
    await loadContestOverview();
  } catch (err) {
    showResult('contest-result', `Error: ${err.message}`, true);
  }
}

async function advanceWeek() {
  if (!confirm('Advance to the next week? This will change the active week for ALL users immediately.')) return;
  try {
    const data = await api('/api/admin/contests/advance', { method: 'POST' });
    showResult('contest-result', `Advanced: "${data.previousWeek}" -> "${data.week}"`);
    await loadContestOverview();
  } catch (err) {
    showResult('contest-result', `Error: ${err.message}`, true);
  }
}

async function publishResult() {
  const week = document.getElementById('result-week').value.trim();
  const ids = document.getElementById('winner-ids').value
    .split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
  const msg = document.getElementById('result-message').value.trim();

  if (!week || !ids.length) {
    showResult('contest-result', 'Week and at least one winner ID are required.', true);
    return;
  }
  if (!confirm(`Publish results for ${week} and notify ${ids.length} winner(s)?`)) return;

  try {
    const data = await api('/api/admin/contests/results', {
      method: 'POST',
      body: JSON.stringify({ week, winnerTelegramIds: ids, message: msg })
    });
    showResult('contest-result',
      `Published - winners notified: ${data.notifications.winners}, participants: ${data.notifications.participants}`
    );
  } catch (err) {
    showResult('contest-result', `Error: ${err.message}`, true);
  }
}

async function toggleContest() {
  try {
    const data = await api('/api/admin/contests/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled: !contestEnabled })
    });
    setContestToggleUI(data.enabled);
  } catch (err) {
    showResult('contest-toggle-status', `Error: ${err.message}`, true);
  }
}

async function runMiningRemindersNow() {
  try {
    const data = await api('/api/admin/notifications/mining-reminders/run', { method: 'POST' });
    const r = data.result || {};
    showResult('notify-result',
      `Run at ${r.runAt || '?'}\nScanned: ${r.scanned ?? 0}, Due: ${r.due ?? 0}, Sent: ${r.sent ?? 0}, Failed: ${r.failed ?? 0}`
    );
    await loadLastMiningReminderRun();
  } catch (err) {
    showResult('notify-result', `Error: ${err.message}`, true);
  }
}

async function loadLastMiningReminderRun() {
  try {
    const data = await api('/api/admin/notifications/mining-reminders/last-run');
    const el = document.getElementById('notify-last-run');
    if (!data.lastRun) { el.textContent = 'No runs recorded yet.'; return; }
    const r = data.lastRun;
    el.textContent = [
      `Last run: ${r.runAt || '?'}`,
      `Requested by: ${r.requestedBy || '?'}`,
      `Scanned: ${r.scanned ?? 0}  Due: ${r.due ?? 0}  Sent: ${r.sent ?? 0}  Failed: ${r.failed ?? 0}`
    ].join('\n');
  } catch (err) {
    document.getElementById('notify-last-run').textContent = `Error: ${err.message}`;
  }
}

const usersWrap = document.getElementById('users-table-wrap');
if (usersWrap) {
  usersWrap.addEventListener('click', (event) => {
    const th = event.target.closest('th[data-sort]');
    if (!th) return;
    const nextKey = th.dataset.sort;
    if (nextKey === currentSortKey) {
      currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      currentSortKey = nextKey;
      currentSortDir = 'asc';
    }
    renderUsersTable(lastUsers);
  });
}

const searchInput = document.getElementById('user-search');
if (searchInput) {
  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadUsers(1);
  });
}

const btnPrev = document.getElementById('btn-prev-page');
if (btnPrev) btnPrev.addEventListener('click', () => loadUsers(Math.max(1, currentUsersPage - 1)));
const btnNext = document.getElementById('btn-next-page');
if (btnNext) btnNext.addEventListener('click', () => loadUsers(Math.min(totalUsersPages, currentUsersPage + 1)));

const btnLoadUsers = document.getElementById('btn-load-users');
if (btnLoadUsers) btnLoadUsers.addEventListener('click', () => loadUsers(1));
const btnUpdateUser = document.getElementById('btn-update-user');
if (btnUpdateUser) btnUpdateUser.addEventListener('click', updateUser);
const btnResetUser = document.getElementById('btn-reset-user');
if (btnResetUser) btnResetUser.addEventListener('click', resetUser);
const btnToggleContest = document.getElementById('btn-toggle-contest');
if (btnToggleContest) btnToggleContest.addEventListener('click', toggleContest);

const btnLoadTasks = document.getElementById('btn-load-tasks');
if (btnLoadTasks) btnLoadTasks.addEventListener('click', loadTasks);
const btnSaveTasks = document.getElementById('btn-save-tasks');
if (btnSaveTasks) btnSaveTasks.addEventListener('click', saveTasks);
const btnSetWeek = document.getElementById('btn-set-week');
if (btnSetWeek) btnSetWeek.addEventListener('click', setWeek);
const btnAdvanceWeek = document.getElementById('btn-advance-week');
if (btnAdvanceWeek) btnAdvanceWeek.addEventListener('click', advanceWeek);
const btnLoadContestOverview = document.getElementById('btn-load-contest-overview');
if (btnLoadContestOverview) btnLoadContestOverview.addEventListener('click', loadContestOverview);
const btnPublish = document.getElementById('btn-publish-result');
if (btnPublish) btnPublish.addEventListener('click', publishResult);
const btnBroadcast = document.getElementById('btn-send-broadcast');
if (btnBroadcast) btnBroadcast.addEventListener('click', sendBroadcast);

const btnRunReminders = document.getElementById('btn-run-mining-reminders');
if (btnRunReminders) btnRunReminders.addEventListener('click', runMiningRemindersNow);

loadStats();
loadContestToggle();
loadTasks();
loadUsers(1);
loadContestOverview();
loadLastMiningReminderRun();
updateRealtimeStatus({ trigger: 'boot' });

window.addEventListener('hope:globalEvent', (event) => {
  const detail = event.detail || {};
  const realtimeTypes = new Set([
    'admin_user_updated',
    'admin_broadcast',
    'weekly_contest_toggled',
    'contest_week_changed',
    'contest_results_published',
    'tasks_updated',
    'mining_reminders_run'
  ]);
  if (!realtimeTypes.has(detail.type)) return;
  scheduleAdminRealtimeRefresh();
});

window.addEventListener('hope:wsync-status', (event) => {
  updateRealtimeStatus(event.detail || {});
});

window.prefillEdit = prefillEdit;
window.quickReset = quickReset;
