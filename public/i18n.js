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
        common: {
          error: 'Error',
          quit: 'Quit'
        },
        topbar: {
          level: 'Level',
          xp: 'XP',
          points: 'Points'
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
          mining_in_progress: 'Mining...',
          claim: 'Claim',
          claiming: 'Claiming...',
          preparing_wallet: 'Preparing wallet...',
          waiting_payment: 'Waiting for payment...',
          reward_title: 'Mining Reward Claimed',
          streak: 'Streak',
          days: 'days',
        },
        checkin: {
          title: 'Daily Check-in Calendar',
          resets: 'Resets daily at 00:02 UTC',
          resets_at: 'Resets daily at {time} UTC',
          current_streak: 'Current streak',
          btn: 'Check In',
          checked: 'Checked',
          missed: 'Missed',
          today: 'Today',
          complete_title: 'Check-in Complete'
        },
        invite: {
          copy_button: 'Invite Frens',
          task_1: 'Invite 1 friend',
          task_3: 'Invite 3 friends',
          task_5: 'Invite 5 friends',
          task_10: 'Invite 10 friends',
          check: 'Check',
          claim: 'Claim',
          claimed: 'Claimed',
          top_referrers: 'Top Referrers',
          rank: 'Rank',
          user: 'User',
          referrals: 'Referrals',
          copied: 'Link Copied',
          load_failed: 'Failed to load invite data',
          unlock_more: 'Invite {count} more friend(s) to unlock this reward.',
          reward_claimed: 'Reward claimed! +{points} points',
          verification_failed: 'Verification failed'
        },
        leaderboard: {
          level_title: 'Level {level} • {name}',
          rank: 'Rank',
          user_id: 'User ID',
          transactions: 'Streaks',
          load_failed: 'Failed to load leaderboard'
        },
        marketplace: {
          title: 'Marketplace',
          games_tab: 'Games',
          exchange_tab: 'Exchange',
          games_heading: 'Games',
          mystery_boxes: 'Mystery Boxes',
          get_mystery_box: 'Get Mystery Box',
          get_box_typed: 'Get {box} Box',
          open_box: 'Open {box} Box',
          daily_limit_reached: 'Daily Limit Reached',
          back_to_games: 'Back to Games',
          exchange_tickets: 'Exchange Tickets',
          bronze_to_silver: 'Bronze -> Silver',
          silver_to_gold: 'Silver -> Gold',
          trade: 'Trade',
          trade_failed: 'Trade failed',
          not_enough_tickets: 'Not enough tickets',
          trade_success: 'Trade successful!',
          load_failed: 'Failed to load marketplace. Please refresh.',
          mystery_action_failed: 'Mystery box action failed',
          all_rounds_complete: 'All {total} rounds complete for today',
          rounds_progress: 'Round {current}/{total} - {count}/{limit} boxes today',
          ready_to_open: 'Ready to open: {box}',
          next_box: 'Next: {box} box',
          come_back_tomorrow: 'Come back tomorrow!',
          rounds_done: 'All {total} rounds done',
          round_badge: 'Round {current} / {total}',
          wallet_required: 'Please connect your wallet first',
          ton_amount_failed: 'Failed to get TON amount',
          recipient_not_configured: 'Payment recipient not configured',
          tx_proof_missing: 'Transaction proof missing',
          purchase_failed: 'Purchase failed',
          open_failed: 'Failed to open box',
          status_failed: 'Failed to load mystery box status',
          box_purchased: '{box} box purchased',
          box_reward_title: '{box} Box Reward',
          box_opened: 'Box opened! Rewards added.'
        },
        tasks: {
          title: 'Tasks',
          daily_tab: 'Daily Tasks',
          one_time_tab: 'One-Time Tasks',
          daily_missions: 'Daily Missions',
          one_time_missions: 'One-Time Missions',
          one_time_hint: 'These can be completed only once. Proof is required to claim rewards.',
          failed_load: 'Failed to load tasks',
          done: 'Done',
          check: 'Check',
          go: 'Go',
          start: 'Start',
          verifying: 'Verifying...',
          calculating: 'Calculating...',
          coming_soon: 'Coming soon',
          under_review_static: 'Under review',
          under_review: 'Under review - {hours}h {minutes}m {seconds}s remaining',
          submitting: 'Submitting...',
          start_verify_failed: 'Failed to start verification',
          task_submitted_review: 'Task submitted for review. Come back in 24 hours to claim your reward.',
          ready_to_claim: 'Task ready to claim.',
          claim_failed: 'Claim failed',
          points_claimed: '+{points} points claimed!',
          already_checked_in_today: 'Already checked in today',
          you_already_checked_in_today: 'You already checked in today',
          task_failed: 'Task failed',
          wallet_required: 'Please connect your TON wallet first',
          ton_amount_failed: 'Failed to get TON amount',
          recipient_not_configured: 'Payment recipient not configured',
          tx_proof_missing: 'Transaction proof missing',
          checkin_failed: 'Check-in failed',
          complete_task_failed: 'Failed to complete task',
          checkin_success_points: 'Check-in successful +{points} points'
        },
        weekly: {
          title: 'Weekly Contest',
          intro: 'Please read and agree to the following rules before entering the contest:',
          rule_1: 'Must be Level 3 (Believer) or higher',
          rule_2: 'You must maintain a 10-day perfect streak (10 consecutive check-ins).',
          rule_3: 'Have 10+ Gold Tickets.',
          rule_4: 'Entering the contest will deduct 10 Gold tickets and require a wallet transaction for 0.5 USDT in $TON.',
          rule_5: '⏳ Contest ends every Sunday at 23:59 UTC',
          agree: 'I have read and agree to the rules.',
          enter: 'Enter Contest',
          disabled_status: 'Weekly Drop is currently disabled. Check back soon.',
          already_entered: 'You have already entered {week}. Good luck!',
          not_eligible: 'You are not eligible to enter.',
          eligible_status: 'Eligible for {week} - {tickets} Gold tickets available.',
          getting_ton_amount: 'Getting TON amount...',
          waiting_wallet: 'Waiting for wallet confirmation...',
          verifying_payment: 'Verifying payment on-chain... please wait',
          ton_amount_failed: 'Failed to get TON amount',
          recipient_not_configured: 'Payment recipient not configured',
          invalid_ton_amount: 'Invalid TON amount',
          tx_proof_missing: 'Transaction proof missing - please try again',
          entry_failed_generic: 'Entry failed',
          entry_success: 'Entered {week}! {message} Gold tickets remaining: {tickets}',
          entry_failed: 'Entry failed: {error}',
          load_failed: 'Unable to load eligibility. Please reopen the app.'
        },
        flipcards: {
          title: 'Flip Cards',
          subtitle: 'Match triplets to win rewards!',
          failed_start: 'Failed to start game',
          daily_pass_required: 'Daily Pass Required',
          pass_unlock_desc: 'Unlock unlimited Flip Cards gameplay for 24 hours',
          unlimited_games: 'Play unlimited games',
          valid_24_hours: 'Valid for 24 hours',
          earn_full_rewards: 'Earn full rewards',
          daily_pass: 'Daily Pass',
          purchase_daily_pass: 'Purchase Daily Pass',
          back_to_games: 'Back to Games',
          move_failed: 'Move failed',
          match_success: 'Match! 🎉',
          time_up: 'Time\'s Up!',
          game_over: 'Game Over',
          failed_claim_reward: 'Failed to claim reward',
          game_complete: 'Game Complete!',
          moves_made: 'Moves Made:',
          time_used: 'Time Used:',
          rewards_earned: 'Rewards Earned',
          points_label: 'Points',
          xp_label: 'XP',
          bronze_tickets: 'Bronze Tickets',
          silver_tickets: 'Silver Tickets',
          total_points: 'Total Points:',
          level_label: 'Level:',
          failed_abandon_game: 'Failed to abandon game',
          select_difficulty: 'Select Difficulty',
          easy_label: 'Easy (3 Triplets)',
          normal_label: 'Normal (4 Triplets)',
          hard_label: 'Hard (5 Triplets)',
          match_triplets: 'Match the Triplets!',
          find_triplets: 'Find groups of 3 matching cards'
        },
        mysteryBox: {
          title: 'Mystery Boxes',
          get_box: 'Get Mystery Box',
          back_to_market: 'Back to Marketplace',
          session_not_ready: 'Session not ready. Please reopen the mini app.'
        },
        pass: {
          failed_load_page: 'Failed to load pass page',
          failed_check_status: 'Failed to check pass status',
          active_until: 'Pass active until {date}',
          unlock_24h: 'Unlock Flip Cards for 24 hours',
          title: 'Flip Cards Pass',
          feature_unlimited: 'Unlimited plays for 24h',
          feature_timer: 'Difficulty-based timer challenge',
          feature_rewards: 'Earn points, XP and tickets',
          daily_pass: 'Daily Pass',
          play_flipcards: 'Play Flip Cards',
          purchase_pass: 'Purchase Pass',
          back_to_games: 'Back to Games',
          legacy_pass: 'Legacy pass detected. Re-purchase required for verified access.',
          preparing_wallet: 'Preparing wallet...',
          waiting_payment: 'Waiting for payment...',
          wallet_required: 'Please connect your TON wallet first',
          ton_amount_failed: 'Failed to get TON amount',
          recipient_not_configured: 'Payment recipient is not configured',
          tx_proof_missing: 'Transaction proof missing',
          verification_failed: 'Purchase verification failed',
          purchased_success: 'Pass purchased successfully',
          purchase_failed: 'Pass purchase failed'
        },
        wallet: {
          choose_wallet: 'Choose Wallet',
          connected_wallet: 'Connected Wallet',
          disconnect: 'Disconnect',
          connected: 'Connected',
          connect_wallet: 'Connect Wallet',
          switch_mainnet: 'Switch to TON Mainnet!',
          disconnect_failed: 'Failed to disconnect wallet',
          open_wallet_failed: 'Failed to open wallet selector'
        },
        games: {
          mystery_box_name: 'Mystery Box',
          mystery_box_desc: 'Buy and open reward boxes to claim instant rewards.',
          flipcards_name: 'Flip Cards',
          flipcards_desc: 'Match triplets of cards to win rewards. 60 seconds to match them all.',
          play: 'Play',
          coming_soon: 'This game is coming soon.'
        },
        script: {
          someone: 'Someone',
          referral_joined: '{name} joined via your invite! +{points} points',
          invited_bonus: 'You were invited! +{points} bonus points',
          auth_failed: 'Authentication failed'
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

  format(key, vars = {}) {
    return this.t(key).replace(/\{(\w+)\}/g, (_, name) => (
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
    ));
  }

  applyTranslations(root = document) {
    root.querySelectorAll?.('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      el.textContent = this.t(key);
    });

    if (root === document) {
      document.documentElement.dir = this.direction;
    }
  }

  get direction() {
    return this.rtlLanguages.has(this.currentLang) ? 'rtl' : 'ltr';
  }
}

export const i18n = new I18n();
