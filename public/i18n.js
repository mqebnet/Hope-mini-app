// public/i18n.js

class I18n {
  constructor() {
    this.currentLang = 'en';
    this.rtlLanguages = new Set(['ar']);

    // All translations inlined — 6 languages, ~3KB total.
    // Avoids async fetch, server config, and Telegram WebView network quirks.
    this.languages = {

      en: {
        nav: {
          home: 'Home', leaders: 'Leaders', invite: 'Invite',
          marketplace: 'Marketplace', tasks: 'Tasks'
        },
        settings: {
          title: 'Settings', language: 'Language',
          haptic: 'Haptic Feedback', sound: 'Sound Effects'
        },
        home: {
          weekly_contest: 'Weekly Contest',
          weekly_drop_locked: 'Weekly Drop (Locked)',
          weekly_drop_disabled: 'Weekly Drop (Disabled)',
          enter_weekly_drop: 'Enter Weekly Drop',
          check_in: 'Check In',
          checked_today: 'Checked Today',
          mining_heading: 'Mining for Points ⛏',
          start_mining: 'Start Mining',
          claim: 'Claim',
          streak: 'Streak',
          days: 'days',
        },
        checkin: {
          title: 'Daily Check-in Calendar',
          resets: 'Resets daily at 00:02 UTC',
          current_streak: 'Current streak',
          btn: 'Check In'
        },
        notifications: {
          checkInSuccess: 'Check-in successful!',
          insufficient_tickets: 'Insufficient tickets! Keep playing to earn more',
          puzzle_success: 'Congratulations! Puzzle solved!',
          daily_checkin: 'Daily check-in successful',
          time_expired: 'Time expired! Try again?'
        }
      },

      es: {
        nav: {
          home: 'Inicio', leaders: 'Líderes', invite: 'Invitar',
          marketplace: 'Mercado', tasks: 'Tareas'
        },
        settings: {
          title: 'Ajustes', language: 'Idioma',
          haptic: 'Retroalimentación háptica', sound: 'Efectos de sonido'
        },
        home: {
          weekly_contest: 'Concurso Semanal',
          weekly_drop_locked: 'Drop Semanal (Bloqueado)',
          weekly_drop_disabled: 'Drop Semanal (Desactivado)',
          enter_weekly_drop: 'Entrar al Drop Semanal',
          check_in: 'Registrarse',
          checked_today: 'Ya registrado hoy',
          mining_heading: 'Minando Puntos ⛏',
          start_mining: 'Iniciar Minería',
          claim: 'Reclamar',
          streak: 'Racha',
          days: 'días',
        },
        checkin: {
          title: 'Calendario de Check-in Diario',
          resets: 'Se reinicia a las 00:02 UTC',
          current_streak: 'Racha actual',
          btn: 'Registrarse'
        },
        notifications: {
          checkInSuccess: '¡Registro exitoso!',
          insufficient_tickets: '¡Tickets insuficientes! Sigue jugando para ganar más',
          puzzle_success: '¡Felicidades! ¡Rompecabezas resuelto!',
          daily_checkin: 'Registro diario exitoso',
          time_expired: '¡Tiempo agotado! ¿Intentar de nuevo?'
        }
      },

      ar: {
        nav: {
          home: 'الرئيسية', leaders: 'المتصدرون', invite: 'دعوة',
          marketplace: 'السوق', tasks: 'المهام'
        },
        settings: {
          title: 'الإعدادات', language: 'اللغة',
          haptic: 'الردود الاهتزازية', sound: 'المؤثرات الصوتية'
        },
        home: {
          weekly_contest: 'المسابقة الأسبوعية',
          weekly_drop_locked: 'الجائزة الأسبوعية (مقفلة)',
          weekly_drop_disabled: 'الجائزة الأسبوعية (معطّلة)',
          enter_weekly_drop: 'الدخول للجائزة الأسبوعية',
          check_in: 'تسجيل الحضور',
          checked_today: 'تم التسجيل اليوم',
          mining_heading: 'استخراج النقاط ⛏',
          start_mining: 'بدء الاستخراج',
          claim: 'استلام',
          streak: 'السلسلة',
          days: 'أيام',
        },
        checkin: {
          title: 'تقويم الحضور اليومي',
          resets: 'يُعاد التعيين يومياً عند 00:02 UTC',
          current_streak: 'السلسلة الحالية',
          btn: 'تسجيل الحضور'
        },
        notifications: {
          checkInSuccess: 'تم تسجيل الحضور بنجاح!',
          insufficient_tickets: 'تذاكر غير كافية! استمر في اللعب لربح المزيد',
          puzzle_success: 'تهانينا! لقد أكملت اللغز بنجاح!',
          daily_checkin: 'تم تسجيل الحضور اليومي',
          time_expired: 'انتهى الوقت! حاول مرة أخرى؟'
        }
      },

      fil: {
        nav: {
          home: 'Tahanan', leaders: 'Mga Lider', invite: 'Mag-imbita',
          marketplace: 'Palengke', tasks: 'Mga Gawain'
        },
        settings: {
          title: 'Mga Setting', language: 'Wika',
          haptic: 'Haptic Feedback', sound: 'Mga Sound Effect'
        },
        home: {
          weekly_contest: 'Lingguhang Paligsahan',
          weekly_drop_locked: 'Weekly Drop (Naka-lock)',
          weekly_drop_disabled: 'Weekly Drop (Hindi Aktibo)',
          enter_weekly_drop: 'Sumali sa Weekly Drop',
          check_in: 'Mag-check In',
          checked_today: 'Na-check In Na Ngayon',
          mining_heading: 'Pagmimina ng mga Puntos ⛏',
          start_mining: 'Simulan ang Pagmimina',
          claim: 'I-claim',
          streak: 'Streak',
          days: 'araw',
        },
        checkin: {
          title: 'Daily Check-in Calendar',
          resets: 'Nire-reset araw-araw sa 00:02 UTC',
          current_streak: 'Kasalukuyang streak',
          btn: 'Mag-check In'
        },
        notifications: {
          checkInSuccess: 'Matagumpay na naka-check in!',
          insufficient_tickets: 'Hindi sapat na mga tiket! Maglaro pa para makakuha ng higit',
          puzzle_success: 'Maligayang pagbati! Natapos mo ang puzzle!',
          daily_checkin: 'Na-check in na para sa araw na ito',
          time_expired: 'Tapos na ang oras! Subukan ulit?'
        }
      },

      zh: {
        nav: {
          home: '首页', leaders: '排行榜', invite: '邀请',
          marketplace: '市场', tasks: '任务'
        },
        settings: {
          title: '设置', language: '语言',
          haptic: '触觉反馈', sound: '音效'
        },
        home: {
          weekly_contest: '每周竞赛',
          weekly_drop_locked: '每周奖励（已锁定）',
          weekly_drop_disabled: '每周奖励（已禁用）',
          enter_weekly_drop: '参加每周奖励',
          check_in: '签到',
          checked_today: '今日已签到',
          mining_heading: '挖矿积分 ⛏',
          start_mining: '开始挖矿',
          claim: '领取',
          streak: '连续',
          days: '天',
        },
        checkin: {
          title: '每日签到日历',
          resets: '每日 00:02 UTC 重置',
          current_streak: '当前连续签到',
          btn: '签到'
        },
        notifications: {
          checkInSuccess: '签到成功！',
          insufficient_tickets: '票数不足！继续游戏获取更多',
          puzzle_success: '恭喜！你完成了拼图！',
          daily_checkin: '今日签到成功',
          time_expired: '时间到！再试一次？'
        }
      },

      ru: {
        nav: {
          home: 'Главная', leaders: 'Лидеры', invite: 'Пригласить',
          marketplace: 'Маркет', tasks: 'Задания'
        },
        settings: {
          title: 'Настройки', language: 'Язык',
          haptic: 'Тактильная отдача', sound: 'Звуковые эффекты'
        },
        home: {
          weekly_contest: 'Еженедельный конкурс',
          weekly_drop_locked: 'Weekly Drop (Заблокировано)',
          weekly_drop_disabled: 'Weekly Drop (Отключено)',
          enter_weekly_drop: 'Войти в Weekly Drop',
          check_in: 'Отметиться',
          checked_today: 'Уже отмечено сегодня',
          mining_heading: 'Майнинг очков ⛏',
          start_mining: 'Начать майнинг',
          claim: 'Получить',
          streak: 'Серия',
          days: 'дн.',
        },
        checkin: {
          title: 'Ежедневный календарь',
          resets: 'Сброс ежедневно в 00:02 UTC',
          current_streak: 'Текущая серия',
          btn: 'Отметиться'
        },
        notifications: {
          checkInSuccess: 'Отметка выполнена!',
          insufficient_tickets: 'Недостаточно билетов! Продолжайте играть, чтобы получить больше',
          puzzle_success: 'Поздравляем! Вы собрали пазл!',
          daily_checkin: 'Ежедневная отметка выполнена',
          time_expired: 'Время вышло! Попробовать снова?'
        }
      },

      ms: {
        nav: {
          home: 'Utama', leaders: 'Pemimpin', invite: 'Jemput',
          marketplace: 'Pasaran', tasks: 'Tugas'
        },
        settings: {
          title: 'Tetapan', language: 'Bahasa',
          haptic: 'Maklum Balas Haptik', sound: 'Kesan Bunyi'
        },
        home: {
          weekly_contest: 'Peraduan Mingguan',
          weekly_drop_locked: 'Weekly Drop (Terkunci)',
          weekly_drop_disabled: 'Weekly Drop (Dilumpuhkan)',
          enter_weekly_drop: 'Sertai Weekly Drop',
          check_in: 'Daftar Masuk',
          checked_today: 'Sudah Daftar Masuk Hari Ini',
          mining_heading: 'Perlombongan Mata ⛏',
          start_mining: 'Mulakan Perlombongan',
          claim: 'Tuntut',
          streak: 'Berturutan',
          days: 'hari',
        },
        checkin: {
          title: 'Kalendar Daftar Masuk Harian',
          resets: 'Tetap semula setiap hari pada 00:02 UTC',
          current_streak: 'Berturutan semasa',
          btn: 'Daftar Masuk'
        },
        notifications: {
          checkInSuccess: 'Daftar masuk berjaya!',
          insufficient_tickets: 'Tiket tidak mencukupi! Terus bermain untuk dapatkan lebih',
          puzzle_success: 'Tahniah! Anda berjaya menyelesaikan teka-teki!',
          daily_checkin: 'Daftar masuk harian berjaya',
          time_expired: 'Masa tamat! Cuba lagi?'
        }
      }
    };
  }

  init(lang) {
    // Supported languages — fall back to 'en' for anything not in the map
    this.currentLang = this.languages[lang] ? lang : 'en';
  }

  t(key) {
    const parts = key.split('.');
    let cur = this.languages[this.currentLang];
    for (const p of parts) {
      cur = cur?.[p];
      if (cur === undefined) {
        // Fall back to English if key missing in selected language
        let fb = this.languages['en'];
        for (const fp of parts) { fb = fb?.[fp]; }
        return typeof fb === 'string' ? fb : key;
      }
    }
    return typeof cur === 'string' ? cur : key;
  }

  get direction() {
    return this.rtlLanguages.has(this.currentLang) ? 'rtl' : 'ltr';
  }
}

export const i18n = new I18n();
