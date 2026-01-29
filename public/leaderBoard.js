import { updateTopBar } from './userData.js';

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

document.addEventListener("DOMContentLoaded", async () => {
  if (window.Telegram?.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
  }

  try {
    const res = await fetch('/api/user/me', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`
      }
    });

    if (!res.ok) throw new Error('Unauthorized');

    const data = await res.json();
    const user = data.user;

    updateTopBar(user);

    currentUserId = user.telegramId;
    currentLevelIndex = LEVEL_INDEX[user.level] || 1;

    await loadLeaderboard(currentLevelIndex);
    enableSwipeNavigation();

  } catch (err) {
    console.error("Initialization error:", err);
    window.location.href = "/auth";
  }
});

async function loadLeaderboard(levelIndex) {
  showLoading(true);

  try {
    const res = await fetch(`/api/leaderboard/by-level/${levelIndex}`);
    const data = await res.json();

    const { levelName, users } = data;

    const list = document.getElementById("leaderboard-list");
    list.innerHTML = "";

    document.getElementById("leaderboard-level").textContent =
      `Level ${levelIndex} • ${levelName}`;

    users.forEach((u, i) => {
      const row = document.createElement("div");
      row.className = "leaderboard-row";
      row.innerHTML = `
        <span class="rank">${i + 1}</span>
        <span class="username">${u.username || u.telegramId}</span>
        <span class="xp">${formatNumber(u.xp)}</span>
        <span class="points">${formatNumber(u.points)}</span>
        <span class="tx">${u.transactionsCount ?? 0}</span>
      `;

      if (u.telegramId === currentUserId) {
        row.classList.add("current-user");
      }

      list.appendChild(row);
    });

    currentLevelIndex = levelIndex;

  } catch (err) {
    console.error(err);
    showNotification("Failed to load leaderboard", "error");
  } finally {
    showLoading(false);
  }
}

/* ======================
   SWIPE NAVIGATION
====================== */
function enableSwipeNavigation() {
  let startX = 0;
  const container = document.getElementById("leaderboard-container");

  container.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  container.addEventListener("touchend", e => {
    const endX = e.changedTouches[0].clientX;
    const diff = startX - endX;

    if (Math.abs(diff) < 50) return;

    const next =
      diff > 0
        ? Math.min(10, currentLevelIndex + 1)
        : Math.max(1, currentLevelIndex - 1);

    if (next !== currentLevelIndex) {
      loadLeaderboard(next);
    }
  }, { passive: true });
}

/* ======================
   HELPERS
====================== */
function formatNumber(num = 0) {
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toString();
}

function showLoading(show) {
  const loader = document.getElementById("loading-indicator") || createLoader();
  loader.style.display = show ? "block" : "none";
}

function createLoader() {
  const loader = document.createElement("div");
  loader.id = "loading-indicator";
  loader.className = "loader";
  document.getElementById("leaderboard-container").appendChild(loader);
  return loader;
}

function showNotification(message, type = "info") {
  const n = document.createElement("div");
  n.className = `notification ${type}`;
  n.textContent = message;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 4000);
}
