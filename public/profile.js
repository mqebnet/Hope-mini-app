// public/profile.js
import { updateTopBar } from './userData.js';

async function loadProfileFragment() {
  const res = await fetch('profile.html');
  if (!res.ok) throw new Error('Failed to load profile fragment');

  const html = await res.text();
  const container = document.getElementById('profile-container');
  if (!container) return;
  container.innerHTML = html;

  if (window.lucide) lucide.createIcons();
}

async function loadUserProfile() {
  const res = await fetch('/api/user/me', { credentials: 'include' });

  if (res.status === 401) {
    window.location.href = '/auth';
    return;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch user (${res.status})`);
  }

  const { user } = await res.json();

  setText('profile-userid', user.telegramId);
  setText('profile-level', user.level);
  setText('profile-points', user.points);
  setText('profile-xp', user.xp);
  setText('profile-bronze-tickets', user.bronzeTickets);
  setText('profile-silver-tickets', user.silverTickets);
  setText('profile-gold-tickets', user.goldTickets);
  setText('profile-streak', user.streak);

  updateTopBar(user);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? '-';
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadProfileFragment();

  const profileButton = document.getElementById('profile-button');
  const profilePanel = document.getElementById('profile-panel');
  const closeBtn = document.getElementById('close-profile-button');

  if (!profileButton || !profilePanel || !closeBtn) return;

  profileButton.addEventListener('click', async () => {
    try {
      await loadUserProfile();
      profilePanel.style.display = 'block';
    } catch (err) {
      console.error(err);
      alert('Failed to load profile');
    }
  });

  closeBtn.addEventListener('click', () => {
    profilePanel.style.display = 'none';
  });
});
