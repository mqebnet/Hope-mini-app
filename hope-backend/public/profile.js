// public/profile.js
import { updateTopBar, fetchUserDataOnce, getCachedUser } from './userData.js';
import { canBootstrap } from './utils.js';
import { i18n } from './i18n.js';

const PROFILE_FALLBACK_HTML = `
<div id="profile-panel" class="profile-panel" style="display: none;">
  <button id="close-profile-button" class="close-btn" aria-label="Close Profile">&times;</button>
  <h2 data-i18n="profile.title">User Profile</h2>
  <p><strong data-i18n="profile.username">Username:</strong> <span id="profile-userid">-</span></p>
  <p><strong data-i18n="profile.level">Level:</strong> <span id="profile-level">-</span></p>
  <p><strong data-i18n="profile.points">Points:</strong> <span id="profile-points">-</span></p>
  <p><strong data-i18n="profile.xp">XP:</strong> <span id="profile-xp">-</span></p>
  <p><strong data-i18n="profile.bronze_tickets">Bronze Tickets:</strong> <span id="profile-bronze-tickets">-</span></p>
  <p><strong data-i18n="profile.silver_tickets">Silver Tickets:</strong> <span id="profile-silver-tickets">-</span></p>
  <p><strong data-i18n="profile.gold_tickets">Gold Tickets:</strong> <span id="profile-gold-tickets">-</span></p>
  <p><strong data-i18n="profile.streak">Streak:</strong> <span id="profile-streak">-</span></p>
  <p><strong data-i18n="profile.perfect_streak_badge">Perfect Streak Badge:</strong> <span id="profile-perfect-streak-badge">-</span></p>
  <p id="profile-admin-row" style="display:none;">
    <strong data-i18n="profile.admin">Admin:</strong>
    <button id="profile-admin-link" type="button" data-i18n="profile.open_admin">Open Admin Dashboard</button>
  </p>
</div>`;

let profileLoading = false;
let lastProfileUser = null;

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

function localizeProfilePanel() {
  const panel = document.getElementById('profile-panel');
  if (!panel) return;
  i18n.applyTranslations(panel);
}

function applyUserToProfile(user) {
  if (!user) return;
  lastProfileUser = user;
  setText('profile-userid', user.username);
  setText('profile-level', user.level);
  setText('profile-points', user.points);
  setText('profile-xp', user.xp);
  setText('profile-bronze-tickets', user.bronzeTickets);
  setText('profile-silver-tickets', user.silverTickets);
  setText('profile-gold-tickets', user.goldTickets);
  setText('profile-streak', user.streak);
  const hasPerfectBadge = Number(user.streak || 0) >= 10;
  setText('profile-perfect-streak-badge', hasPerfectBadge ? i18n.t('profile.badge_earned') : i18n.t('profile.badge_not_yet'));
  const adminRow = document.getElementById('profile-admin-row');
  if (adminRow) {
    adminRow.style.display = user.isAdmin ? 'block' : 'none';
  }
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
  localizeProfilePanel();
  if (lastProfileUser) applyUserToProfile(lastProfileUser);
  return profilePanel;
}

async function loadUserProfile() {
  // Use cached user data (populated by script.js)
  let user = getCachedUser();
  
  if (!user) {
    user = await fetchUserDataOnce();
  }

  if (!user) {
    throw new Error('Failed to load user data');
  }

  applyUserToProfile(user);
  updateTopBar(user);
}

window.addEventListener('hope:userUpdated', (event) => {
  const user = event.detail;
  if (!user) return;
  updateTopBar(user);
  const panel = document.getElementById('profile-panel');
  if (panel && panel.style.display !== 'none') {
    applyUserToProfile(user);
  }
});

window.addEventListener('hope:languageChanged', () => {
  localizeProfilePanel();
  if (lastProfileUser) applyUserToProfile(lastProfileUser);
});

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
  profileContainer.addEventListener('click', (event) => {
    const adminBtn = event.target.closest('#profile-admin-link');
    if (!adminBtn) return;
    window.location.href = '/admin';
  });

  profileButton.addEventListener('click', async () => {
    // Prevent double clicks while loading
    if (profileLoading) return;
    
    profileLoading = true;
    try {
      const profilePanel = await ensureProfilePanel(profileContainer);
      if (!profilePanel) throw new Error('Profile panel not initialized');

      profileContainer.style.display = 'block';
      profilePanel.style.display = 'block';

      setProfileLoading();
      await loadUserProfile();
    } catch (err) {
      console.error(err);
      alert(i18n.t('common.something_happened'));
    } finally {
      profileLoading = false;
    }
  });
});
