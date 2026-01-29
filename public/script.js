// script.js

document.addEventListener("DOMContentLoaded", () => {
  // First check for existing session
  if (localStorage.getItem("jwt")) {
    initializeApp();
    fetchAuthenticatedUser();
    
  } else {
    // If no session, try Telegram auth
    initializeTelegramWebApp();
  }
});

function initializeApp() {
  // Initialize all app components
  loadProfilePanel();
  setupEventListeners();
  
  // Set up periodic data refresh
setInterval(fetchAuthenticatedUser, 5000);

  
  // Initialize language and other startup tasks
  const tgLanguage = window.Telegram.WebApp.initDataUnsafe.user?.language_code || 'en';
  let userLanguage = localStorage.getItem('appLanguage') || tgLanguage;
  i18n.init(userLanguage);
  applyTranslations();
}
// ==================== Core Functions ====================
function initializeTelegramWebApp() {
  const tg = window.Telegram.WebApp;
  tg.ready();
  tg.expand();

  // Validate Telegram user
  const user = tg.initDataUnsafe?.user;
  if (!user) {
    alert("User authentication failed.");
    window.location.href = "auth.html";
    return;
  }
  
  localStorage.setItem("userId", user.id);
  authenticateTelegramUser(tg.initData);
}

async function authenticateTelegramUser(initData) {
  try {
    const response = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData })
    });
    
    if (!response.ok) throw new Error("Authentication failed");
     const data = await response.json();
    localStorage.setItem('jwt', data.token);
    localStorage.setItem('userId', data.user.id);
    initializeApp();

  } catch (error) {
    console.error("Auth error:", error);
    alert("⚠️ Authentication failed. Please try again.");
  }
}

// ==================== User Data Management ====================
import { updateUI } from './userData.js';

async function fetchAuthenticatedUser() {
  try {
    const res = await fetch('/api/user/me', {
      headers: {
        Authorization: `Bearer ${localStorage.getItem('jwt')}`
      }
    });

    if (!res.ok) throw new Error('Unauthorized');

    const data = await res.json();
    updateUI(data.user);
  } catch (err) {
    console.error('User fetch failed:', err);
    localStorage.removeItem('jwt');
    window.location.href = '/auth';
  }
}



// ==================== Event Handlers ====================
function setupEventListeners() {
  // Check-in Button
  document.getElementById("check-in-button").addEventListener("click", handleCheckIn);
  
  // Mining Button
  document.getElementById("farm-btn").addEventListener("click", handleMining);

  // Navigation Buttons
  document.querySelectorAll('.nav-btn').forEach(button => {
    button.addEventListener("click", handleNavigation);
  });

  // Profile Button
  document.getElementById("profile-button").addEventListener("click", toggleProfilePanel);
}

async function handleCheckIn() {
  const button = document.getElementById("check-in-button");
  button.disabled = true;
  button.textContent = "Checking in...";

  try {
    const response = await fetch('/api/dailyCheckIn/daily-checkin', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${localStorage.getItem('jwt')}`
  }
});


    if (!response.ok) throw new Error("Check-in failed");
    
    showNotification("✅ Check-in successful!", "success");
    await fetchAuthenticatedUser();
  } catch (error) {
    showNotification(`❌ ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Check In";
  }
}



// ==================== UI Helpers ====================
function showNotification(message, type = "info") {
  const message = i18n.t(`notifications.${message}`);
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 4000);
}

function showConfetti() {
  confetti({
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 }
  });
}

// ==================== Profile Panel ====================
function loadProfilePanel() {
  fetch("profile.html")
    .then(response => response.text())
    .then(html => {
      document.getElementById("profile-container").innerHTML = html;
      lucide.createIcons();
    })
    .catch(console.error);
}

function toggleProfilePanel() {
  const panel = document.getElementById("profile-panel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

document.getElementById('settings-button').addEventListener('click', () => {
  document.getElementById('settings-panel').style.display = "flex";
});

// Close settings
document.querySelector('#settings-panel .close-btn').addEventListener('click', () => {
  document.getElementById('settings-panel').style.display = "none";
});
// Initialize language
i18n.init(userLanguage);
document.getElementById('language-select').value = userLanguage;

// Language change handler
document.getElementById('language-select').addEventListener('change', (e) => {
  userLanguage = e.target.value;
  localStorage.setItem('appLanguage', userLanguage);
  i18n.init(userLanguage);
  applyTranslations();
});

// Apply translations to all elements
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = i18n.t(key);
  });
}

// Initial translation
applyTranslations();