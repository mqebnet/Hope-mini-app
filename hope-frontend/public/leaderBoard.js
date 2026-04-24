// public/leaderBoard.js
import { updateTopBar, fetchUserDataOnce, getCachedUser } from './userData.js';
import { canBootstrap } from './utils.js';
import { subscribeToLeaderboard } from './wsync.js';
import { i18n } from './i18n.js';

let currentLevelIndex = 1;
let currentUserId = null;

const LEVEL_INDEX = {
  Seeker: 1,
  Dreamer: 2,
  Believer: 3,
  Challenger: 4,
  Navigator: 5,
  Ascender: 6,
  Master: 7,
  Grandmaster: 8,
  Legend: 9,
  Eldrin: 10
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!canBootstrap('leaderboard')) return;

  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
  }

  try {
    let user = getCachedUser();
    if (!user) {
      user = await fetchUserDataOnce();
    }

    if (!user) throw new Error('Failed to load user');

    updateTopBar(user);
    currentUserId = user.telegramId;
    currentLevelIndex = LEVEL_INDEX[user.level] || 1;

    initArrowNavigation();
    await loadLeaderboard(currentLevelIndex);
    enableSwipeNavigation();
  } catch (err) {
    console.error('Initialization error:', err);
    window.location.href = '/auth';
  }
});

function navigateLeaderboard(delta) {
  const nextLevel = Math.min(10, Math.max(1, currentLevelIndex + delta));
  if (nextLevel === currentLevelIndex) return;
  loadLeaderboard(nextLevel);
}

function initArrowNavigation() {
  const prevBtn = document.getElementById('leaderboard-prev');
  const nextBtn = document.getElementById('leaderboard-next');
  if (!prevBtn || !nextBtn) return;

  prevBtn.addEventListener('click', () => navigateLeaderboard(-1));
  nextBtn.addEventListener('click', () => navigateLeaderboard(1));
}

window.refreshLeaderboard = async function refreshLeaderboard() {
  console.log('[Leaderboard] Refreshing from WebSocket update');
  await loadLeaderboard(currentLevelIndex);
};

async function loadLeaderboard(levelIndex) {
  showLoading(true);

  try {
    const res = await fetch(`/api/leaderboard/by-level/${levelIndex}`, { credentials: 'include' });
    const data = await res.json();

    const { levelName, users = [], currentUser } = data;
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    document.getElementById('leaderboard-level').textContent = i18n.format('leaderboard.level_title', {
      level: levelIndex,
      name: levelName
    });

    users.forEach((u, i) => {
      list.appendChild(createMainLeaderboardRow({
        rank: i + 1,
        ...u
      }, {
        isCurrentUser: u.telegramId === currentUserId
      }));
    });

    const currentUserInTop = users.some((u) => u.telegramId === currentUserId);
    if (currentUser && !currentUserInTop) {
      list.appendChild(createDetachedDivider());
      list.appendChild(createMainLeaderboardRow(currentUser, {
        isCurrentUser: true,
        detached: true
      }));
    }

    currentLevelIndex = levelIndex;
    window.currentLeaderboardLevel = levelIndex;
    subscribeToLeaderboard(levelIndex);
  } catch (err) {
    console.error(err);
    showNotification(i18n.t('leaderboard.load_failed'), 'error');
  } finally {
    showLoading(false);
  }
}

function createMainLeaderboardRow(user, options = {}) {
  const { isCurrentUser = false, detached = false } = options;
  const displayName = user.username || user.telegramId;
  const row = document.createElement('div');
  row.className = 'leaderboard-row';
  if (isCurrentUser) row.classList.add('current-user');
  if (detached) row.classList.add('detached-current-user');

  const rank = document.createElement('span');
  rank.className = 'rank';
  rank.textContent = String(user.rank ?? '');

  const username = document.createElement('span');
  username.className = 'username';
  username.title = String(displayName);
  username.textContent = String(displayName);

  const xp = document.createElement('span');
  xp.className = 'xp';
  xp.textContent = formatNumber(user.xp);

  const points = document.createElement('span');
  points.className = 'points';
  points.textContent = formatNumber(user.points);

  const streak = document.createElement('span');
  streak.className = 'streak';
  streak.textContent = String(user.streak ?? 0);

  row.append(rank, username, xp, points, streak);
  return row;
}

function createDetachedDivider() {
  const divider = document.createElement('div');
  divider.className = 'leaderboard-divider';
  divider.textContent = '...';
  return divider;
}

function enableSwipeNavigation() {
  let startX = 0;
  const container = document.getElementById('leaderboard-container');

  container.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    const endX = e.changedTouches[0].clientX;
    const diff = startX - endX;

    if (Math.abs(diff) < 50) return;

    navigateLeaderboard(diff > 0 ? 1 : -1);
  }, { passive: true });
}

function formatNumber(num = 0) {
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toString();
}

function showLoading(show) {
  const loader = document.getElementById('loading-indicator') || createLoader();
  loader.style.display = show ? 'block' : 'none';
}

function createLoader() {
  const loader = document.createElement('div');
  loader.id = 'loading-indicator';
  loader.className = 'loader';
  document.getElementById('leaderboard-container').appendChild(loader);
  return loader;
}

function showNotification(message, type = 'info') {
  const n = document.createElement('div');
  n.className = `notification ${type}`;
  n.textContent = message;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 4000);
}
