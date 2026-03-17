// public/i18n.js
class I18n {
  constructor() {
    this.languages = {
      en: {
        settings: {
          title: 'Settings',
          language: 'Language',
          haptic: 'Haptic Feedback',
          sound: 'Sound Effects'
        },
        notifications: {
          checkInSuccess: 'Check-in successful!',
          insufficient_tickets: 'Insufficient tickets! Keep playing to earn more'
        }
      }
    };
    this.rtlLanguages = new Set(['ar']);
    this.currentLang = 'en';
  }

  init(lang) {
    this.currentLang = this.languages[lang] ? lang : 'en';
  }

  t(key) {
    const parts = key.split('.');
    let cur = this.languages[this.currentLang];

    for (const p of parts) {
      cur = cur?.[p];
      if (cur === undefined) return key;
    }

    return typeof cur === 'string' ? cur : key;
  }

  get direction() {
    return this.rtlLanguages.has(this.currentLang) ? 'rtl' : 'ltr';
  }
}

export const i18n = new I18n();
