import { i18n } from './i18n.js';

const HAPTIC_STORAGE_KEY = 'hope_haptic_enabled';
const SOUND_STORAGE_KEY = 'hope_sound_enabled';

function parseEnabled(raw, fallback = true) {
  if (raw === null || raw === undefined) return fallback;
  const value = String(raw).trim().toLowerCase();
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

function saveFeedbackSettings({ haptic, sound }) {
  localStorage.setItem(HAPTIC_STORAGE_KEY, haptic ? '1' : '0');
  localStorage.setItem(SOUND_STORAGE_KEY, sound ? '1' : '0');
}

function loadFeedbackSettings() {
  return {
    haptic: parseEnabled(localStorage.getItem(HAPTIC_STORAGE_KEY), true),
    sound: parseEnabled(localStorage.getItem(SOUND_STORAGE_KEY), true)
  };
}

function previewFeedback(type = 'info') {
  if (typeof window.hopeTriggerFeedback === 'function') {
    window.hopeTriggerFeedback(type);
  }
}

function openSettings() {
  const panel = document.getElementById('settings-panel');
  panel.classList.remove('hidden');
}

function closeSettings() {
  const panel = document.getElementById('settings-panel');
  panel.classList.add('hidden');
}

function applyTranslations() {
  i18n.applyTranslations(document);
  window.dispatchEvent(new CustomEvent('hope:languageChanged', { detail: { lang: i18n.currentLang } }));
}

document.addEventListener('DOMContentLoaded', () => {
  const settingsBtn = document.getElementById('settings-button');
  const closeBtn = document.querySelector('.close-settings');
  const langSelect = document.getElementById('language-select');
  const hapticToggle = document.getElementById('haptic-toggle');
  const soundToggle = document.getElementById('sound-toggle');

  const savedLang = localStorage.getItem('lang') || 'en';
  const feedbackSettings = loadFeedbackSettings();
  i18n.init(savedLang);
  langSelect.value = savedLang;
  if (hapticToggle) hapticToggle.checked = feedbackSettings.haptic;
  if (soundToggle) soundToggle.checked = feedbackSettings.sound;

  applyTranslations();

  settingsBtn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);

  langSelect.addEventListener('change', e => {
    const lang = e.target.value;
    localStorage.setItem('lang', lang);
    i18n.init(lang);
    applyTranslations();
  });

  if (hapticToggle || soundToggle) {
    const onFeedbackToggleChange = () => {
      const next = {
        haptic: Boolean(hapticToggle?.checked),
        sound: Boolean(soundToggle?.checked)
      };
      saveFeedbackSettings(next);
      previewFeedback('success');
    };
    hapticToggle?.addEventListener('change', onFeedbackToggleChange);
    soundToggle?.addEventListener('change', onFeedbackToggleChange);
  }
});

// Expose for inline button
window.closeSettings = closeSettings;
