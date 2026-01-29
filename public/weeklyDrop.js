import { fetchUserData, updateTopBar, getCurrentLevel } from './userData.js';

document.addEventListener("DOMContentLoaded", async () => {
  const rulesCheckbox = document.getElementById("rules-checkbox");
  const enterButton = document.getElementById("enter-contest-button");
  const statusEl = document.getElementById("eligibility-status");

  const user = await fetchUserData();
  updateTopBar(user);

  const level = getCurrentLevel(user.points || 0);
  const isBelieverOrAbove = level.name === "Believer" || [
    "Challenger","Navigator","Ascender","Master",
    "Grandmaster","Legend","Eldrin"
  ].includes(level.name);

  const hasPerfectStreak = (user.streak || 0) >= 10;
  const hasGold = (user.goldTickets || 0) >= 10;

  if (!isBelieverOrAbove) {
    statusEl.textContent = "🔒 You must reach Level 3 (Believer) to enter.";
    return;
  }

  if (!hasPerfectStreak) {
    statusEl.textContent = "🔥 You need a perfect 10-day streak.";
    return;
  }

  if (!hasGold) {
    statusEl.textContent = "🏆 You need at least 10 Gold Tickets.";
    return;
  }

  statusEl.textContent = "✅ You are eligible to enter the Weekly Drop.";

  rulesCheckbox.addEventListener("change", () => {
    enterButton.disabled = !rulesCheckbox.checked;
  });

  enterButton.addEventListener("click", async () => {
    try {
      const res = await fetch('/api/weekly-drop', {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem('jwt')}`
        }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Entry failed");

      alert("🎉 Entry accepted. Redirecting to wallet…");

      if (data.transactionUrl) {
        window.location.href = data.transactionUrl;
      }

    } catch (err) {
      alert(err.message);
    }
  });
});
