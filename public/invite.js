// invite.js (Frontend)
import { fetchUserData, updateTopBar, getCachedUser } from './userData.js';
import { canBootstrap, debounceButton } from './utils.js';
import { i18n } from './i18n.js';

window.addEventListener('hope:userUpdated', (event) => {
  const user = event.detail;
  if (!user) return;
  updateTopBar(user);
});

window.addEventListener('hope:languageChanged', () => {
  loadProgress().catch((err) => {
    console.warn('Invite language refresh failed:', err);
  });
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

    // Share invite link via Telegram native share sheet
    document.getElementById("copy-invite-btn").addEventListener("click", (event) => {
      const btn = event.currentTarget;
      if (!debounceButton(btn, 600)) return;

      const introText = i18n.t('invite.share_intro');

      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLinkInput.value || inviteLink)}&text=${encodeURIComponent(introText)}`;
      if (window.Telegram?.WebApp?.openTelegramLink) {
        window.Telegram.WebApp.openTelegramLink(shareUrl);
      } else {
        showNotification(i18n.t('invite.verification_failed'), 'error');
      }
    });

    // Load progress + leaderboard in parallel
    await Promise.all([
      loadProgress(),
      loadReferralLeaderboard()
    ]);

    lucide.createIcons();
  } catch (err) {
    console.error(err);
    showNotification(i18n.t('invite.load_failed'), "error");
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
      btn.textContent = i18n.t('invite.claimed');
      btn.disabled = true;
      btn.classList.add('claimed');
      return;
    }

    btn.onclick = async () => {
      try {
        const verifyRes = await fetch(`/api/invite/verify?target=${target}`, { credentials: 'include', cache: 'no-store' });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyData.error || i18n.t('invite.verification_failed'));
        const { completed, claimed } = verifyData;
        if (claimed) {
          btn.textContent = i18n.t('invite.claimed');
          btn.disabled = true;
          btn.classList.add('claimed');
          return;
        }

        if (!completed) {
          showNotification(
            i18n.format('invite.unlock_more', { count: target - invitedCount }),
            'info'
          );
          return;
        }

        btn.textContent = i18n.t('invite.claim');
        btn.classList.add('claimable');

        btn.onclick = async () => {
          const claimRes = await fetch(`/api/invite/claim?target=${target}`, {
            method: 'POST',
            credentials: 'include'
          });

          const claimData = await claimRes.json();
          if (!claimRes.ok) throw new Error(claimData.error || i18n.t('invite.verification_failed'));

          const refreshedUser = await fetchUserData();
          updateTopBar(refreshedUser);
          showNotification(i18n.format('invite.reward_claimed', { points: claimData.reward?.points || 0 }), "success");
          await loadProgress();
        };
      } catch (e) {
        console.error('Invite verification failed:', e);
        showNotification(i18n.t('invite.verification_failed'), "error");
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
      <span>${u.username || i18n.format('invite.user_fallback', { id: u.userId })}</span>
      <span>${u.referrals}</span>
    `;
    container.appendChild(row);
  });
}


// Tiny toast helper
function showNotification(message, type = "info") {
  if (typeof window.showNotification === 'function') {
    window.showNotification(message, type);
    return;
  }

  let host = document.getElementById('notification-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'notification-host';
    host.setAttribute('aria-live', 'polite');
    host.setAttribute('aria-atomic', 'true');
    document.body.appendChild(host);
  }

  const el = document.createElement("div");
  el.className = `notification ${type}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }, 3000);
}
