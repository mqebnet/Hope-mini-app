// public/userData.js
// UI-only helpers

export function formatPoints(points = 0) {
  if (points >= 1e9) return `${(points / 1e9).toFixed(1)}B`;
  if (points >= 1e6) return `${(points / 1e6).toFixed(1)}M`;
  if (points >= 1e3) return `${(points / 1e3).toFixed(0)}K`;
  return points.toLocaleString();
}

export async function fetchUserData() {
  const res = await fetch('/api/user/me', { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error('Unauthorized');
  const data = await res.json();
  return data.user;
}

export function getCurrentLevel(points = 0) {
  const levels = [
    { name: 'Seeker', min: 0 },
    { name: 'Dreamer', min: 50000 },
    { name: 'Believer', min: 100000 },
    { name: 'Challenger', min: 500000 },
    { name: 'Navigator', min: 1000000 },
    { name: 'Ascender', min: 2000000 },
    { name: 'Master', min: 5000000 },
    { name: 'Grandmaster', min: 10000000 },
    { name: 'Legend', min: 20000000 },
    { name: 'Eldrin', min: 50000000 }
  ];

  let current = levels[0];
  for (const level of levels) {
    if (points >= level.min) current = level;
  }
  return current;
}

export function updateTopBar(user) {
  if (!user) return;

  setText('current-level', user.level || 'Seeker');
  
  // Display points as "current/max" format
  const currentFormatted = formatPoints(user.points || 0);
  const maxFormatted = formatPoints(user.nextLevelAt || 50000);
  setText('points-display', `${currentFormatted}/${maxFormatted}`);
  
  setText('streak', user.streak || 0);
  setText('user-exp', user.xp || 0);
  setText('bronze-tickets', user.bronzeTickets || 0);
  setText('silver-tickets', user.silverTickets || 0);
  setText('gold-tickets', user.goldTickets || 0);

  const progressEl = document.getElementById('points-progress');
  const pointsBarEl = document.getElementById('points-bar');
  if (progressEl && pointsBarEl && user.nextLevelAt) {
    const progress = Math.min((user.points || 0) / user.nextLevelAt, 1);
    progressEl.style.width = `${progress * 100}%`;
  }
}

export function updateUI(user) {
  updateTopBar(user);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

