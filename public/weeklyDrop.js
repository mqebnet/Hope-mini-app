// public/weeklyDrop.js
import { fetchUserData, updateTopBar } from './userData.js';
import { canBootstrap, debounceButton } from './utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Bootstrap lock: prevent running twice
  if (!canBootstrap('weeklydrop')) return;

  const rulesCheckbox = document.getElementById('rules-checkbox');
  const enterButton = document.getElementById('enter-contest-button');
  const statusEl = document.getElementById('eligibility-status');

  try {
    const user = await fetchUserData();
    updateTopBar(user);

    const isBelieverOrAbove = [
      'Believer', 'Challenger', 'Navigator', 'Ascender',
      'Master', 'Grandmaster', 'Legend', 'Eldrin'
    ].includes(user.level);

    const hasPerfectStreak = (user.streak || 0) >= 10;
    const hasGold = (user.goldTickets || 0) >= 10;

    if (!isBelieverOrAbove) {
      statusEl.textContent = 'You must reach Level 3 (Believer) to enter.';
      return;
    }

    if (!hasPerfectStreak) {
      statusEl.textContent = 'You need a perfect 10-day streak.';
      return;
    }

    if (!hasGold) {
      statusEl.textContent = 'You need at least 10 Gold Tickets.';
      return;
    }

    statusEl.textContent = 'You are eligible to enter the Weekly Drop.';

    rulesCheckbox.addEventListener('change', () => {
      enterButton.disabled = !rulesCheckbox.checked;
    });

    enterButton.addEventListener('click', async () => {
      // Debounce button: prevent double clicks
      if (!debounceButton(enterButton, 1000)) return;

      try {
        const res = await fetch('/api/weeklyDrop/enter', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ boc: 'manual_pending' })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Entry failed');
        alert(data.message || 'Entry accepted');
      } catch (err) {
        alert(err.message);
      }
    });
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Unable to load user eligibility.';
  }
});
