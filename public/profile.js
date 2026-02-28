// public/profile.js
import { updateTopBar } from './userData.js';

const PROFILE_FALLBACK_HTML = `
<div id="profile-panel" class="profile-panel" style="display: none;">
  <button id="close-profile-button" class="close-btn" aria-label="Close Profile">&times;</button>
  <h2>User Profile</h2>
  <p><strong>Username:</strong> <span id="profile-userid">-</span></p>
  <p><strong>Level:</strong> <span id="profile-level">-</span></p>
  <p><strong>Points:</strong> <span id="profile-points">-</span></p>
  <p><strong>XP:</strong> <span id="profile-xp">-</span></p>
  <p><strong>Bronze Tickets:</strong> <span id="profile-bronze-tickets">-</span></p>
  <p><strong>Silver Tickets:</strong> <span id="profile-silver-tickets">-</span></p>
  <p><strong>Gold Tickets:</strong> <span id="profile-gold-tickets">-</span></p>
  <p><strong>Streak:</strong> <span id="profile-streak">-</span></p>
  <p><strong>Perfect Streak Badge:</strong> <span id="profile-perfect-streak-badge">-</span></p>
</div>`;

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '-';
}

function setProfileLoading() {
  setText('profile-userid', '...');
  setText('profile-level', '...');
  setText('profile-points', '...');
  setText('profile-xp', '...');
  setText('profile-bronze-tickets', '...');
  setText('profile-silver-tickets', '...');
  setText('profile-gold-tickets', '...');
  setText('profile-streak', '...');
  setText('profile-perfect-streak-badge', '...');
}

async function ensureProfilePanel(profileContainer) {
  let profilePanel = document.getElementById('profile-panel');
  if (profilePanel) return profilePanel;

  try {
    const res = await fetch('/profile.html', { cache: 'no-store' });
    if (!res.ok) throw new Error(`profile fragment ${res.status}`);
    profileContainer.innerHTML = await res.text();
  } catch (err) {
    console.warn('Profile fragment fetch failed, using fallback:', err);
    profileContainer.innerHTML = PROFILE_FALLBACK_HTML;
  }

  if (window.lucide) lucide.createIcons();
  profilePanel = document.getElementById('profile-panel');
  return profilePanel;
}

async function loadUserProfile() {
  const res = await fetch('/api/user/me', { credentials: 'include', cache: 'no-store' });

  if (res.status === 401) {
    window.location.href = '/auth';
    return;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch user (${res.status})`);
  }

  const { user } = await res.json();

  setText('profile-userid', user.username);
  setText('profile-level', user.level);
  setText('profile-points', user.points);
  setText('profile-xp', user.xp);
  setText('profile-bronze-tickets', user.bronzeTickets);
  setText('profile-silver-tickets', user.silverTickets);
  setText('profile-gold-tickets', user.goldTickets);
  setText('profile-streak', user.streak);
  const hasPerfectBadge = (user.badges || []).includes('perfect-streak-10');
  setText('profile-perfect-streak-badge', hasPerfectBadge ? 'Earned' : 'Not yet');

  updateTopBar(user);
}

document.addEventListener('DOMContentLoaded', () => {
  const profileButton = document.getElementById('profile-button');
  const profileContainer = document.getElementById('profile-container');

  if (!profileButton || !profileContainer) return;

  profileContainer.addEventListener('click', (event) => {
    const closeBtn = event.target.closest('#close-profile-button');
    if (!closeBtn) return;

    const panel = document.getElementById('profile-panel');
    if (panel) panel.style.display = 'none';
    profileContainer.style.display = 'none';
  });

  profileButton.addEventListener('click', async () => {
    try {
      const profilePanel = await ensureProfilePanel(profileContainer);
      if (!profilePanel) throw new Error('Profile panel not initialized');

      profileContainer.style.display = 'block';
      profilePanel.style.display = 'block';

      setProfileLoading();
      await loadUserProfile();
    } catch (err) {
      console.error(err);
      alert('Failed to load profile');
    }
  });
});
