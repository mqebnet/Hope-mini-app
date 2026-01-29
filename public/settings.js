import { i18n } from './i18n.js';

function openSettings() {
  const panel = document.getElementById('settings-panel');
  panel.classList.remove('hidden');
}

function closeSettings() {
  const panel = document.getElementById('settings-panel');
  panel.classList.add('hidden');
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = i18n.t(key);
  });

  document.documentElement.dir = i18n.direction;
}

document.addEventListener('DOMContentLoaded', () => {
  const settingsBtn = document.getElementById('settings-button');
  const closeBtn = document.querySelector('.close-settings');
  const langSelect = document.getElementById('language-select');

  const savedLang = localStorage.getItem('lang') || 'en';
  i18n.init(savedLang);
  langSelect.value = savedLang;

  applyTranslations();

  settingsBtn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);

  langSelect.addEventListener('change', e => {
    const lang = e.target.value;
    localStorage.setItem('lang', lang);
    i18n.init(lang);
    applyTranslations();
  });
});

// Expose for inline button
window.closeSettings = closeSettings;
