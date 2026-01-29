// userData.js
// UI-only helpers (NO fetching, NO timers, NO side effects)



/* ==========================
   FORMATTERS
========================== */
export function formatPoints(points = 0) {
  if (points >= 1e9) return `${(points / 1e9).toFixed(1)}B`;
  if (points >= 1e6) return `${(points / 1e6).toFixed(1)}M`;
  if (points >= 1e3) return `${(points / 1e3).toFixed(0)}K`;
  return points.toLocaleString();
}

/* ==========================
   TOP BAR + HOME UI
========================== */
export function updateTopBar(user) {
  if (!user) return;

  setText("current-level", user.level || "Seeker");
  setText("points-display", formatPoints(user.points || 0));
  setText("streak", user.streak || 0);
  setText("user-exp", user.xp || 0);

  setText("bronze-tickets", user.bronzeTickets || 0);
  setText("silver-tickets", user.silverTickets || 0);
  setText("gold-tickets", user.goldTickets || 0);

  // Optional progress bar (purely cosmetic now)
  const progressEl = document.getElementById("points-progress");
  if (progressEl && user.nextLevelAt) {
    const progress =
      Math.min((user.points || 0) / user.nextLevelAt, 1) * 100;
    progressEl.style.width = `${progress}%`;
  }
}


/* ==========================
   GENERIC UI HELPER
========================== */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
