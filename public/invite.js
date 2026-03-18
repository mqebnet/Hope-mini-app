// invite.js (Frontend)
import { fetchUserData, updateTopBar, getCachedUser } from './userData.js';
import { canBootstrap, debounceButton } from './utils.js';

window.addEventListener('hope:userUpdated', (event) => {
  const user = event.detail;
  if (!user) return;
  updateTopBar(user);
});

document.addEventListener("DOMContentLoaded", async () => {
  // Bootstrap lock: prevent running twice
  if (!canBootstrap('invite')) return;

  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();

  try {
    // Render top bar instantly from cache — no network wait
    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    // Fire all independent fetches in parallel
    const [userData, linkRes] = await Promise.all([
      fetchUserData(),
      fetch('/api/invite/link', { credentials: 'include' })
    ]);

    // Update top bar with fresh data
    updateTopBar(userData);

    // Load invite link for the current user
    const inviteLinkInput = document.getElementById("invite-link");
    const { inviteLink } = await linkRes.json();
    inviteLinkInput.value = inviteLink;

    // Copy link
    document.getElementById("copy-invite-btn").addEventListener("click", () => {
      inviteLinkInput.select();
      navigator.clipboard.writeText(inviteLink);
      showNotification('Link copied to clipboard!', 'success');
    });

    // Load progress + leaderboard in parallel
    await Promise.all([
      loadProgress(),
      loadReferralLeaderboard()
    ]);

    lucide.createIcons();
  } catch (err) {
    console.error(err);
    showNotification("Failed to load invite data", "error");
  }
});

async function loadProgress() {
  const res = await fetch('/api/invite/progress', { credentials: 'include', cache: 'no-store' });
  const data = await res.json();

  const invitedCount = data.invitedCount || 0;
  const completedTasks = Array.isArray(data.completedTasks)
    ? data.completedTasks.map((v) => Number(v))
    : [];

  document.querySelectorAll('.invite-task').forEach(task => {
    const target = parseInt(task.dataset.target, 10);
    const bar = task.querySelector('.progress-bar');
    const label = task.querySelector('.progress-label');
    const btn = task.querySelector('.check-button');

    const progress = Math.min(invitedCount, target);
    bar.style.width = `${(progress / target) * 100}%`;
    label.textContent = `${progress}/${target}`;

    if (completedTasks.includes(target)) {
      btn.textContent = "Claimed";
      btn.disabled = true;
      btn.classList.add('claimed');
      return;
    }

    btn.onclick = async () => {
      try {
        const verifyRes = await fetch(`/api/invite/verify?target=${target}`, { credentials: 'include', cache: 'no-store' });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error || 'Verification failed');
        const { completed, claimed } = verifyData;
        if (claimed) {
          btn.textContent = "Claimed";
          btn.disabled = true;
          btn.classList.add('claimed');
          return;
        }

        if (!completed) {
          showNotification(
            `Invite ${target - invitedCount} more friend(s) to unlock this reward.`,
            'info'
          );
          return;
        }

        btn.textContent = "Claim";
        btn.classList.add('claimable');

        btn.onclick = async () => {
          const claimRes = await fetch(`/api/invite/claim?target=${target}`, {
            method: 'POST',
            credentials: 'include'
          });

          const claimData = await claimRes.json();
          if (!claimRes.ok) throw new Error(claimData.error || "Claim failed");

          const refreshedUser = await fetchUserData();
          updateTopBar(refreshedUser);
          showNotification(`Reward claimed! +${claimData.reward?.points || 0} points`, "success");
          await loadProgress();
        };
      } catch (e) {
        showNotification(e.message || "Verification failed", "error");
      }
    };
  });
}

async function loadReferralLeaderboard() {
  const res = await fetch('/api/invite/top-referrers', { credentials: 'include' });
  const data = await res.json();

  const container = document.getElementById('referral-leaderboard-list');
  if (!container) return;

  container.innerHTML = '';

  data.forEach((u, i) => {
    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.innerHTML = `
      <span>${i + 1}</span>
      <span>${u.username || `User ${u.userId}`}</span>
      <span>${u.referrals}</span>
    `;
    container.appendChild(row);
  });
}


// Tiny toast helper
function showNotification(message, type = "info") {
  const el = document.createElement("div");
  el.className = `notification ${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
