// public/i18n.js

class I18n {
  constructor() {
    this.currentLang = 'en';
    this.rtlLanguages = new Set(['ar']);

    // All translations inlined - 6 languages, ~3KB total.
    // Avoids async fetch, server config, and Telegram WebView network quirks.
    this.languages = {

      en: {
        nav: {
          home: 'Home', leaders: 'Leaders', invite: 'Invite',
          marketplace: 'Marketplace', tasks: 'Tasks'
        },
        common: {
          error: 'Error',
          quit: 'Quit',
          ok: 'OK',
          notice: 'Notice',
          something_happened: 'Something happened',
          rate_limited: 'Too many requests. Please wait a moment and try again.',
          reward_claimed: 'Reward Claimed',
          points: 'Points',
          bronze: 'Bronze',
          silver: 'Silver',
          gold: 'Gold'
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
          mining_heading: 'Mining for Points',
          start_mining: 'Start Mining',
          mining_in_progress: 'Mining...',
          claim: 'Claim',
          claiming: 'Claiming...',
          preparing_wallet: 'Preparing wallet...',
          waiting_payment: 'Waiting for payment...',
          reward_title: 'Mining Reward Claimed',
          start_mining_failed: 'Failed to start mining',
          mining_reward_points: '+{points} points!',
          mining_claim_failed: 'Mining claim failed - please try again',
          welcome_bonus_title: 'Welcome Bonus',
          welcome_bonus_points_from: 'You have received {amount} points from {inviter}.',
          welcome_bonus_bronze: 'You also received {count} Bronze tickets.',
          your_inviter: 'your inviter',
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
          complete_title: 'Check-in Complete',
          fetch_status_failed: 'Failed to fetch daily check-in status',
          wallet_required: 'Please connect your TON wallet first',
          already_checked_in_today: 'Already checked in today',
          ton_amount_failed: 'Failed to get TON amount',
          recipient_not_configured: 'Payment recipient is not configured',
          invalid_ton_amount: 'Invalid TON amount',
          tx_proof_missing: 'Transaction proof missing',
          failed: 'Check-in failed'
        },
        invite: {
          copy_button: 'Invite Frens',
          share_intro: '?? ???? ??? ???? ????. ???? ???? ?? Hope Universe!\n\n?? ?? ?????? ??????? ????? ???????? ????? ????????? ????????? ????? ?????? ?????? ??????.\n?? ????? ??? ?????? ????? ????? ???????!\n\n?? ???? ??????. ?? ???? ????? ?????:',
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
          user_fallback: 'User {id}',
          unlock_more: 'Invite {count} more friend(s) to unlock this reward.',
          reward_claimed: 'Reward claimed! +{points} points',
          verification_failed: 'Verification failed'
        },
        leaderboard: {
          level_title: 'Level {level} - {name}',
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
          awaiting_payment_verification: 'Pending...',
          verifying_purchase_wait: 'Verifying on-chain...',
          verifying_purchase_wait_hint: 'Please keep this page open for a few seconds.',
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
          checkin_success_points: 'Check-in successful +{points} points',
          task_daily_checkin_title: 'Daily Check-in',
          task_daily_checkin_desc: 'Start your day with a check-in (+{points} points)',
          task_visit_telegram_title: 'Visit Telegram Channel',
          task_visit_telegram_desc: 'Check our Telegram updates (+{points} points)',
          task_twitter_engage_title: 'Like & Retweet Post',
          task_twitter_engage_desc: 'Engage with our latest Tweet (+{points} points)',
          task_watch_youtube_title: 'Watch YouTube Video',
          task_watch_youtube_desc: 'Watch our latest video (+{points} points)',
          task_join_telegram_title: 'Subscribe to Telegram Channel',
          task_join_telegram_desc: 'Become a member (+{points} points)',
          task_subscribe_youtube_title: 'Subscribe to YouTube',
          task_subscribe_youtube_desc: 'Join our video hub (+{points} points)',
          task_follow_twitter_title: 'Follow Twitter Handle',
          task_follow_twitter_desc: 'Stay updated (+{points} points)',
          task_join_group_title: 'Join Chat Group',
          task_join_group_desc: 'Meet the community (+{points} points)',
          task_future_title: 'Special Mission',
          task_future_desc: 'Coming soon'
        },
        weekly: {
          title: 'Weekly Contest',
          intro: 'Please read and agree to the following rules before entering the contest:',
          rule_1: 'Must be Level 3 (Believer) or higher',
          rule_2: 'You must maintain a 10-day perfect streak (10 consecutive check-ins).',
          rule_3: 'Have 10+ Gold Tickets.',
          rule_4: 'Entering the contest will deduct 10 Gold tickets and require a wallet transaction for 0.5 USDT in $TON.',
          rule_5: 'Contest ends every Sunday at 23:59 UTC',
          agree: 'I have read and agree to the rules.',
          enter: 'Enter Contest',
          disabled_status: 'Weekly Drop is currently disabled. Check back soon.',
          already_entered: 'You have already entered {week}. Good luck!',
          not_eligible: 'You are not eligible to enter.',
          lock_require_level: 'Reach Believer level or higher.',
          lock_require_streak: 'Maintain a 10-day streak (current: {current}/10).',
          lock_require_gold: 'Need at least 10 Gold tickets (current: {current}/10).',
          lock_require_wallet: 'Connect a TON wallet to receive prizes.',
          lock_locked_prefix: 'Weekly Drop locked: {reasons}',
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
          match_success: 'Match🎉',
          time_up: 'Time\'s Up!',
          game_over: 'Game Over😣',
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
          auth_failed: 'Authentication failed',
          contest_results_published_for: 'Contest results published for {week}.',
          contest_results_published: 'Contest results were published.'
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
          home: 'Inicio', leaders: 'Lideres', invite: 'Invitar',
          marketplace: 'Mercado', tasks: 'Tareas'
        },
        common: {
          error: 'Error',
          quit: 'Salir',
          ok: 'OK',
          notice: 'Aviso',
          something_happened: 'Ha ocurrido algo',
          rate_limited: 'Demasiadas solicitudes. Espera un momento e intentalo de nuevo.',
          reward_claimed: 'Recompensa reclamada',
          points: 'Puntos',
          bronze: 'Bronce',
          silver: 'Plata',
          gold: 'Oro'
        },
        topbar: {
          level: 'Nivel',
          xp: 'XP',
          points: 'Puntos'
        },
        settings: {
          title: 'Ajustes', language: 'Idioma',
          haptic: 'Retroalimentacion haptica', sound: 'Efectos de sonido'
        },
        home: {
          weekly_contest: 'Concurso Semanal',
          weekly_drop_locked: 'Drop Semanal (Bloqueado)',
          weekly_drop_disabled: 'Drop Semanal (Desactivado)',
          enter_weekly_drop: 'Entrar al Drop Semanal',
          check_in: 'Registrarse',
          checked_today: 'Ya registrado hoy',
          mining_heading: 'Minando Puntos',
          start_mining: 'Iniciar Mineria',
          mining_in_progress: 'Minando...',
          claim: 'Reclamar',
          claiming: 'Reclamando...',
          preparing_wallet: 'Preparando billetera...',
          waiting_payment: 'Esperando pago...',
          reward_title: 'Recompensa de mineria reclamada',
          start_mining_failed: 'No se pudo iniciar la mineria',
          mining_reward_points: '+{points} puntos!',
          mining_claim_failed: 'Error al reclamar mineria. Intenta de nuevo',
          welcome_bonus_title: 'Bono de bienvenida',
          welcome_bonus_points_from: 'Has recibido {amount} puntos de {inviter}.',
          welcome_bonus_bronze: 'Tambien recibiste {count} boletos de bronce.',
          your_inviter: 'tu invitador',
          streak: 'Racha',
          days: 'dias',
        },
        checkin: {
          title: 'Calendario de Check-in Diario',
          resets: 'Se reinicia a las 00:02 UTC',
          current_streak: 'Racha actual',
          btn: 'Registrarse',
          complete_title: 'Check-in completado',
          fetch_status_failed: 'No se pudo obtener el estado del check-in diario',
          wallet_required: 'Conecta primero tu billetera TON',
          already_checked_in_today: 'Ya hiciste check-in hoy',
          ton_amount_failed: 'No se pudo obtener la cantidad de TON',
          recipient_not_configured: 'El destinatario del pago no esta configurado',
          invalid_ton_amount: 'Cantidad de TON invalida',
          tx_proof_missing: 'Falta la prueba de transaccion',
          failed: 'Fallo el check-in'
        },
        weekly: {
          lock_require_level: 'Alcanza nivel Believer o superior.',
          lock_require_streak: 'Manten una racha de 10 dias (actual: {current}/10).',
          lock_require_gold: 'Necesitas al menos 10 boletos Gold (actual: {current}/10).',
          lock_require_wallet: 'Conecta una billetera TON para recibir premios.',
          lock_locked_prefix: 'Weekly Drop bloqueado: {reasons}'
        },
        script: {
          someone: 'Alguien',
          contest_results_published_for: 'Resultados del concurso publicados para {week}.',
          contest_results_published: 'Se publicaron los resultados del concurso.'
        },
        notifications: {
          checkInSuccess: 'Registro exitoso!',
          insufficient_tickets: 'Tickets insuficientes! Sigue jugando para ganar mas',
          puzzle_success: 'Felicidades! Rompecabezas resuelto!',
          daily_checkin: 'Registro diario exitoso',
          time_expired: 'Tiempo agotado! Intentar de nuevo?'
        }
      },


      ar: {
        nav: {
          home: '????????', leaders: '?????????', invite: '????',
          marketplace: '?????', tasks: '??????'
        },
        common: {
          error: '???',
          quit: '????',
          ok: '?????',
          notice: '?????',
          something_happened: '??? ??? ??',
          rate_limited: '????? ????? ????. ????? ?????? ?? ???? ??? ????.',
          reward_claimed: '?? ?????? ????????',
          points: '????',
          bronze: '??????',
          silver: '???',
          gold: '????'
        },
        topbar: {
          level: '???????',
          xp: 'XP',
          points: '????'
        },
        settings: {
          title: '?????????', language: '?????',
          haptic: '?????? ??????????', sound: '???????? ???????'
        },
        home: {
          weekly_contest: '???????? ?????????',
          weekly_drop_locked: '???????? ????????? (?????)',
          weekly_drop_disabled: '???????? ????????? (??????)',
          enter_weekly_drop: '?????? ???????? ?????????',
          check_in: '????? ??????',
          checked_today: '?? ??????? ?????',
          mining_heading: '??????? ??????',
          start_mining: '??? ?????????',
          mining_in_progress: '???? ?????????...',
          claim: '??????',
          claiming: '???? ????????...',
          preparing_wallet: '???? ????? ???????...',
          waiting_payment: '??????? ?????...',
          reward_title: '?? ?????? ?????? ?????????',
          start_mining_failed: '??? ??? ?????????',
          mining_reward_points: '+{points} ????!',
          mining_claim_failed: '??? ?????? ?????? ?????????? ???? ??? ????',
          welcome_bonus_title: '?????? ???????',
          welcome_bonus_points_from: '??? ?????? {amount} ???? ?? {inviter}.',
          welcome_bonus_bronze: '?????? ????? {count} ????? ???????.',
          your_inviter: '????? ???? ????',
          streak: '???????',
          days: '????',
        },
        checkin: {
          title: '????? ?????? ??????',
          resets: '????? ??????? ?????? ??? 00:02 UTC',
          current_streak: '??????? ???????',
          btn: '????? ??????',
          complete_title: '????? ????? ??????',
          fetch_status_failed: '??? ??? ???? ????? ?????? ??????',
          wallet_required: '???? ??? ????? TON ?????',
          already_checked_in_today: '?? ????? ?????? ????? ??????',
          ton_amount_failed: '??? ?????? ??? ???? TON',
          recipient_not_configured: '????? ??????? ??? ?????',
          invalid_ton_amount: '???? TON ??? ?????',
          tx_proof_missing: '???? ???????? ?????',
          failed: '??? ????? ??????'
        },
        invite: {
          copy_button: '???? ????????',
          share_intro: '?? ???? ??? ???? ????. ???? ???? ?? Hope Universe!

?? ?? ?????? ??????? ????? ???????? ????? ????????? ????????? ????? ?????? ?????? ??????.
?? ????? ??? ?????? ????? ????? ???????!

?? ???? ??????. ?? ???? ????? ?????:',
          task_1: '???? ?????? ??????',
          task_3: '???? 3 ??????',
          task_5: '???? 5 ??????',
          task_10: '???? 10 ??????',
          check: '????',
          claim: '??????',
          claimed: '?? ????????',
          top_referrers: '???? ????????',
          rank: '???????',
          user: '????????',
          referrals: '????????',
          copied: '?? ??? ??????',
          load_failed: '???? ????? ?????? ??????',
          user_fallback: '???????? {id}',
          unlock_more: '???? {count} ????/?????? ??????? ???? ??? ????????.',
          reward_claimed: '?? ?????? ????????! +{points} ????',
          verification_failed: '??? ??????'
        },
        tasks: {
          title: '??????',
          daily_tab: '?????? ???????',
          one_time_tab: '???? ???? ?????',
          daily_missions: '?????? ???????',
          one_time_missions: '???? ???? ?????',
          one_time_hint: '???? ????? ??? ?????? ??? ????? ???. ????? ????? ??????? ????????.',
          failed_load: '???? ????? ??????',
          done: '??',
          check: '????',
          go: '????',
          start: '????',
          verifying: '???? ??????...',
          calculating: '???? ??????...',
          coming_soon: '??????',
          under_review_static: '??? ????????',
          under_review: '??? ???????? - ??????? {hours}? {minutes}? {seconds}?',
          submitting: '???? ???????...',
          start_verify_failed: '??? ??? ??????',
          task_submitted_review: '?? ????? ?????? ????????. ?? ??? 24 ???? ??????? ???????.',
          ready_to_claim: '?????? ????? ????????.',
          claim_failed: '??? ????????',
          points_claimed: '?? ?????? +{points} ????!',
          already_checked_in_today: '?? ????? ?????? ????? ??????',
          you_already_checked_in_today: '??? ???? ????? ????? ??????',
          task_failed: '???? ??????',
          wallet_required: '???? ??? ????? TON ?????',
          ton_amount_failed: '??? ?????? ??? ???? TON',
          recipient_not_configured: '????? ??????? ??? ?????',
          tx_proof_missing: '???? ???????? ?????',
          checkin_failed: '??? ????? ??????',
          complete_task_failed: '??? ????? ??????',
          checkin_success_points: '?? ????? ?????? +{points} ????',
          task_daily_checkin_title: '????? ?????? ??????',
          task_daily_checkin_desc: '???? ???? ?????? ?????? (+{points} ????)',
          task_visit_telegram_title: '????? ???? ????????',
          task_visit_telegram_desc: '???? ??? ????????? (+{points} ????)',
          task_twitter_engage_title: '??????? ?????? ??? ???????',
          task_twitter_engage_desc: '????? ?? ???? ?????? ??? (+{points} ????)',
          task_watch_youtube_title: '?????? ????? ??????',
          task_watch_youtube_desc: '???? ???? ????? ??? (+{points} ????)',
          task_join_telegram_title: '???????? ?? ???? ????????',
          task_join_telegram_desc: '???? ????? (+{points} ????)',
          task_subscribe_youtube_title: '???????? ?? ??????',
          task_subscribe_youtube_desc: '???? ??? ???? ?????????? (+{points} ????)',
          task_follow_twitter_title: '?????? ???? ?????',
          task_follow_twitter_desc: '???? ??? ????? (+{points} ????)',
          task_join_group_title: '???????? ??? ?????? ???????',
          task_join_group_desc: '????? ??? ??????? (+{points} ????)',
          task_future_title: '???? ????',
          task_future_desc: '??????'
        },
        weekly: {
          title: '???????? ?????????',
          intro: '???? ????? ????????? ??? ??????? ??????? ??? ???? ????????:',
          rule_1: '??? ?? ???? ???????? 3 (Believer) ?? ????',
          rule_2: '??? ?????? ??? ????? ?????? ???? 10 ???? (10 ?????? ????? ???????).',
          rule_3: '????? 10+ ????? ?????.',
          rule_4: '???? ???????? ????? 10 ????? ????? ?????? ?????? ????? ????? 0.5 USDT ??? $TON.',
          rule_5: '????? ???????? ?? ??? ??? 23:59 UTC',
          agree: '??? ???? ?????? ??? ???????.',
          enter: '???? ????????',
          disabled_status: '???????? ????????? ????? ??????. ?????? ?????? ??????.',
          already_entered: '??? ???? ?????? {week}. ???? ??????!',
          not_eligible: '??? ??? ???? ??????.',
          lock_require_level: '??? ?????? ??? ????? Believer ?? ????.',
          lock_require_streak: '???? ??? ????? 10 ???? (??????: {current}/10).',
          lock_require_gold: '????? 10 ????? ????? ??? ????? (??????: {current}/10).',
          lock_require_wallet: '???? ????? TON ??????? ???????.',
          lock_locked_prefix: 'Weekly Drop ????: {reasons}',
          eligible_status: '???? ?? {week} - ??????? ??????? ???????: {tickets}.',
          getting_ton_amount: '???? ??? ???? TON...',
          waiting_wallet: '??????? ????? ???????...',
          verifying_payment: '???? ?????? ?? ????? ??? ???????... ???? ????????',
          ton_amount_failed: '??? ?????? ??? ???? TON',
          recipient_not_configured: '????? ??????? ??? ?????',
          invalid_ton_amount: '???? TON ??? ?????',
          tx_proof_missing: '???? ???????? ????? - ???? ??? ????',
          entry_failed_generic: '??? ??????',
          entry_success: '?? ???? {week}! {message} ??????? ??????? ????????: {tickets}',
          entry_failed: '??? ??????: {error}',
          load_failed: '???? ????? ???????. ???? ????? ??? ???????.'
        },
        script: {
          someone: '??? ??',
          contest_results_published_for: '?? ??? ????? ???????? ??????? {week}.',
          contest_results_published: '?? ??? ????? ????????.'
        },
        notifications: {
          checkInSuccess: '?? ????? ?????? ?????!',
          insufficient_tickets: '????? ??? ?????! ????? ?? ????? ???? ??????',
          puzzle_success: '???????! ??? ????? ????? ?????!',
          daily_checkin: '?? ????? ?????? ??????',
          time_expired: '????? ?????! ???? ??? ?????'
        }
      },

      fil: {
        nav: {
          home: 'Tahanan', leaders: 'Mga Lider', invite: 'Mag-imbita',
          marketplace: 'Palengke', tasks: 'Mga Gawain'
        },
        common: {
          error: 'Error',
          quit: 'Umalis',
          ok: 'OK',
          notice: 'Paalala',
          something_happened: 'May nangyari',
          rate_limited: 'Masyadong maraming request. Maghintay sandali at subukan ulit.',
          reward_claimed: 'Na-claim ang Reward',
          points: 'Puntos',
          bronze: 'Bronze',
          silver: 'Silver',
          gold: 'Gold'
        },
        topbar: {
          level: 'Level',
          xp: 'XP',
          points: 'Puntos'
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
          mining_heading: 'Pagmimina ng mga Puntos',
          start_mining: 'Simulan ang Pagmimina',
          mining_in_progress: 'Nagmi-mina...',
          claim: 'I-claim',
          claiming: 'Kini-claim...',
          preparing_wallet: 'Inihahanda ang wallet...',
          waiting_payment: 'Naghihintay ng bayad...',
          reward_title: 'Na-claim ang Mining Reward',
          start_mining_failed: 'Hindi masimulan ang pagmimina',
          mining_reward_points: '+{points} puntos!',
          mining_claim_failed: 'Nabigo ang mining claim - subukan ulit',
          welcome_bonus_title: 'Welcome Bonus',
          welcome_bonus_points_from: 'Nakatanggap ka ng {amount} puntos mula kay {inviter}.',
          welcome_bonus_bronze: 'Nakatanggap ka rin ng {count} Bronze tickets.',
          your_inviter: 'ang nag-imbita sa iyo',
          streak: 'Streak',
          days: 'araw',
        },
        checkin: {
          title: 'Daily Check-in Calendar',
          resets: 'Nire-reset araw-araw sa 00:02 UTC',
          current_streak: 'Kasalukuyang streak',
          btn: 'Mag-check In',
          complete_title: 'Tapos na ang Check-in',
          fetch_status_failed: 'Hindi makuha ang daily check-in status',
          wallet_required: 'Pakikonek muna ang TON wallet mo',
          already_checked_in_today: 'Naka-check in ka na ngayong araw',
          ton_amount_failed: 'Hindi makuha ang TON amount',
          recipient_not_configured: 'Hindi naka-configure ang payment recipient',
          invalid_ton_amount: 'Invalid na TON amount',
          tx_proof_missing: 'Walang transaction proof',
          failed: 'Nabigo ang check-in'
        },
        weekly: {
          lock_require_level: 'Abutin ang Believer level o mas mataas.',
          lock_require_streak: 'Panatilihin ang 10-araw na streak (kasalukuyan: {current}/10).',
          lock_require_gold: 'Kailangan ng hindi bababa sa 10 Gold tickets (kasalukuyan: {current}/10).',
          lock_require_wallet: 'Ikonekta ang TON wallet para makatanggap ng premyo.',
          lock_locked_prefix: 'Naka-lock ang Weekly Drop: {reasons}'
        },
        script: {
          someone: 'May tao',
          contest_results_published_for: 'Na-publish na ang contest results para sa {week}.',
          contest_results_published: 'Na-publish na ang contest results.'
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
        common: {
          error: '错误',
          quit: '退出',
          ok: '确定',
          notice: '提示',
          something_happened: '发生了一些情况',
          rate_limited: '请求过多。请稍候再试。',
          reward_claimed: '奖励已领取',
          points: '积分',
          bronze: '青铜',
          silver: '白银',
          gold: '黄金'
        },
        topbar: {
          level: '等级',
          xp: 'XP',
          points: '积分'
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
          mining_in_progress: '挖矿中...',
          claim: '领取',
          claiming: '领取中...',
          preparing_wallet: '正在准备钱包...',
          waiting_payment: '等待支付...',
          reward_title: '挖矿奖励已领取',
          start_mining_failed: '开始挖矿失败',
          mining_reward_points: '+{points} 积分!',
          mining_claim_failed: '领取挖矿奖励失败，请重试',
          welcome_bonus_title: '欢迎奖励',
          welcome_bonus_points_from: '你已收到来自 {inviter} 的 {amount} 积分。',
          welcome_bonus_bronze: '你还收到了 {count} 张青铜票。',
          your_inviter: '邀请你的人',
          streak: '连续',
          days: '天',
        },
        checkin: {
          title: '每日签到日历',
          resets: '每日 00:02 UTC 重置',
          current_streak: '当前连续签到',
          btn: '签到',
          complete_title: '签到完成',
          fetch_status_failed: '获取每日签到状态失败',
          wallet_required: '请先连接你的 TON 钱包',
          already_checked_in_today: '你今天已签到',
          ton_amount_failed: '获取 TON 数量失败',
          recipient_not_configured: '收款地址未配置',
          invalid_ton_amount: '无效的 TON 数量',
          tx_proof_missing: '缺少交易凭证',
          failed: '签到失败'
        },
        weekly: {
          lock_require_level: '达到 Believer 等级或更高。',
          lock_require_streak: '保持 10 天连续签到（当前：{current}/10）。',
          lock_require_gold: '至少需要 10 张黄金票（当前：{current}/10）。',
          lock_require_wallet: '连接 TON 钱包以接收奖励。',
          lock_locked_prefix: 'Weekly Drop 已锁定：{reasons}'
        },
        script: {
          someone: '有人',
          contest_results_published_for: '{week} 的比赛结果已发布。',
          contest_results_published: '比赛结果已发布。'
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
        common: {
          error: 'Ошибка',
          quit: 'Выйти',
          ok: 'OK',
          notice: 'Уведомление',
          something_happened: 'Что-то произошло',
          rate_limited: 'Слишком много запросов. Подождите немного и попробуйте снова.',
          reward_claimed: 'Награда получена',
          points: 'Очки',
          bronze: 'Бронза',
          silver: 'Серебро',
          gold: 'Золото'
        },
        topbar: {
          level: 'Уровень',
          xp: 'XP',
          points: 'Очки'
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
          mining_in_progress: 'Майнинг...',
          claim: 'Получить',
          claiming: 'Получение...',
          preparing_wallet: 'Подготовка кошелька...',
          waiting_payment: 'Ожидание платежа...',
          reward_title: 'Награда за майнинг получена',
          start_mining_failed: 'Не удалось начать майнинг',
          mining_reward_points: '+{points} очков!',
          mining_claim_failed: 'Не удалось получить награду за майнинг, попробуйте снова',
          welcome_bonus_title: 'Приветственный бонус',
          welcome_bonus_points_from: 'Вы получили {amount} очков от {inviter}.',
          welcome_bonus_bronze: 'Вы также получили {count} бронзовых билетов.',
          your_inviter: 'ваш пригласивший',
          streak: 'Серия',
          days: 'дн.',
        },
        checkin: {
          title: 'Ежедневный календарь',
          resets: 'Сброс ежедневно в 00:02 UTC',
          current_streak: 'Текущая серия',
          btn: 'Отметиться',
          complete_title: 'Отметка завершена',
          fetch_status_failed: 'Не удалось получить статус ежедневной отметки',
          wallet_required: 'Сначала подключите TON кошелек',
          already_checked_in_today: 'Вы уже отметились сегодня',
          ton_amount_failed: 'Не удалось получить сумму TON',
          recipient_not_configured: 'Адрес получателя не настроен',
          invalid_ton_amount: 'Некорректная сумма TON',
          tx_proof_missing: 'Отсутствует подтверждение транзакции',
          failed: 'Отметка не удалась'
        },
        weekly: {
          lock_require_level: 'Достигните уровня Believer или выше.',
          lock_require_streak: 'Поддерживайте серию 10 дней (текущая: {current}/10).',
          lock_require_gold: 'Нужно минимум 10 золотых билетов (текущая: {current}/10).',
          lock_require_wallet: 'Подключите TON кошелек для получения призов.',
          lock_locked_prefix: 'Weekly Drop заблокирован: {reasons}'
        },
        script: {
          someone: 'Кто-то',
          contest_results_published_for: 'Результаты конкурса опубликованы за {week}.',
          contest_results_published: 'Результаты конкурса опубликованы.'
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
        common: {
          error: 'Ralat',
          quit: 'Keluar',
          ok: 'OK',
          notice: 'Notis',
          something_happened: 'Sesuatu berlaku',
          rate_limited: 'Terlalu banyak permintaan. Tunggu sebentar dan cuba lagi.',
          reward_claimed: 'Ganjaran Dituntut',
          points: 'Mata',
          bronze: 'Gangsa',
          silver: 'Perak',
          gold: 'Emas'
        },
        topbar: {
          level: 'Tahap',
          xp: 'XP',
          points: 'Mata'
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
          mining_heading: 'Perlombongan Mata',
          start_mining: 'Mulakan Perlombongan',
          mining_in_progress: 'Sedang melombong...',
          claim: 'Tuntut',
          claiming: 'Sedang menuntut...',
          preparing_wallet: 'Sedang menyediakan dompet...',
          waiting_payment: 'Menunggu pembayaran...',
          reward_title: 'Ganjaran perlombongan telah dituntut',
          start_mining_failed: 'Gagal memulakan perlombongan',
          mining_reward_points: '+{points} mata!',
          mining_claim_failed: 'Tuntutan perlombongan gagal - sila cuba lagi',
          welcome_bonus_title: 'Bonus Selamat Datang',
          welcome_bonus_points_from: 'Anda telah menerima {amount} mata daripada {inviter}.',
          welcome_bonus_bronze: 'Anda juga menerima {count} tiket Gangsa.',
          your_inviter: 'penjemput anda',
          streak: 'Berturutan',
          days: 'hari',
        },
        checkin: {
          title: 'Kalendar Daftar Masuk Harian',
          resets: 'Tetap semula setiap hari pada 00:02 UTC',
          current_streak: 'Berturutan semasa',
          btn: 'Daftar Masuk',
          complete_title: 'Daftar masuk selesai',
          fetch_status_failed: 'Gagal mendapatkan status daftar masuk harian',
          wallet_required: 'Sila sambungkan dompet TON anda dahulu',
          already_checked_in_today: 'Anda sudah daftar masuk hari ini',
          ton_amount_failed: 'Gagal mendapatkan jumlah TON',
          recipient_not_configured: 'Penerima pembayaran belum dikonfigurasi',
          invalid_ton_amount: 'Jumlah TON tidak sah',
          tx_proof_missing: 'Bukti transaksi tiada',
          failed: 'Daftar masuk gagal'
        },
        weekly: {
          lock_require_level: 'Capai tahap Believer atau lebih tinggi.',
          lock_require_streak: 'Kekalkan streak 10 hari (semasa: {current}/10).',
          lock_require_gold: 'Perlu sekurang-kurangnya 10 tiket Emas (semasa: {current}/10).',
          lock_require_wallet: 'Sambungkan dompet TON untuk menerima hadiah.',
          lock_locked_prefix: 'Weekly Drop terkunci: {reasons}'
        },
        script: {
          someone: 'Seseorang',
          contest_results_published_for: 'Keputusan pertandingan diterbitkan untuk {week}.',
          contest_results_published: 'Keputusan pertandingan telah diterbitkan.'
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
    // Supported languages - fall back to 'en' for anything not in the map
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

if (typeof window !== 'undefined') {
  window.hopeI18nT = (key) => i18n.t(key);
  window.hopeI18nFormat = (key, vars) => i18n.format(key, vars);
}


