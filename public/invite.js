// invite.js (Frontend)
import { fetchUserData, updateTopBar } from './userData.js';

document.addEventListener("DOMContentLoaded", async () => {
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();

  try {
    const userData = await fetchUserData();
    updateTopBar(userData);

    // Load invite link for the current user
    const inviteLinkInput = document.getElementById("invite-link");
    const linkRes = await fetch('/api/invite/link');
    const { inviteLink } = await linkRes.json();
    inviteLinkInput.value = inviteLink;

    // Copy link
    document.getElementById("copy-invite-btn").addEventListener("click", () => {
      inviteLinkInput.select();
      navigator.clipboard.writeText(inviteLink);
      showNotification('Link copied to clipboard!', 'success');
    });

    // Load progress
    await loadProgress();

    lucide.createIcons();
  } catch (err) {
    console.error(err);
    showNotification("Failed to load invite data", "error");
  }
});

async function loadProgress() {
  const res = await fetch('/api/invite/progress');
  const data = await res.json();

  const invitedCount = data.invitedCount || 0;
  const completedTasks = data.completedTasks || [];

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
        const verifyRes = await fetch(`/api/invite/verify?target=${target}`);
        const { completed } = await verifyRes.json();

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
            method: 'POST'
          });

          if (!claimRes.ok) {
            const err = await claimRes.json();
            throw new Error(err.error || "Claim failed");
          }

          showNotification("Reward claimed!", "success");
          await loadProgress();
        };
      } catch (e) {
        showNotification(e.message || "Verification failed", "error");
      }
    };
  });
}

async function loadReferralLeaderboard() {
  const res = await fetch('/api/invite/top-referrers');
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
