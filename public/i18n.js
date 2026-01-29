import en from './locales/en.json' assert { type: 'json' };
import es from './locales/es.json' assert { type: 'json' };
import ar from './locales/ar.json' assert { type: 'json' };
import fil from './locales/fil.json' assert { type: 'json' };
import zh from './locales/zh.json' assert { type: 'json' };
import ru from './locales/ru.json' assert { type: 'json' };
import ms from './locales/ms.json' assert { type: 'json' };

class I18n {
  constructor() {
    this.languages = { en, es, ar, fil, zh, ru, ms };
    this.rtlLanguages = new Set(['ar']);
    this.currentLang = 'en';
  }

  init(lang) {
    this.currentLang = this.languages[lang] ? lang : 'en';
  }

  t(key) {
    return this.languages[this.currentLang][key] || key;
  }

  get direction() {
    return this.rtlLanguages.has(this.currentLang) ? 'rtl' : 'ltr';
  }
}

export const i18n = new I18n();
