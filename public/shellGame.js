import { updateTopBar, getCachedUser, setCachedUser, fetchUserData } from './userData.js';
import { i18n } from './i18n.js';
import { navigateWithFeedback } from './utils.js';

const STORAGE_KEY = 'hope_shellgame_session_id';
const ROUND_TIMEOUT_BUFFER_MS = 650;
const ROUND_REVEAL_MS = 900;
const ROUND_HIDE_MS = 220;
const ROUND_SWAP_GAP_MS = 80;
const CUPS = ['A', 'B', 'C'];

function t(key, fallback) {
  const value = i18n.t(key);
  return value && value !== key ? value : fallback;
}

function showNotification(message, type = 'info') {
  if (type === 'success' && typeof window.showSuccessToast === 'function') return window.showSuccessToast(message);
  if (type === 'error' && typeof window.showErrorToast === 'function') return window.showErrorToast(message);
  if (type === 'warn' && typeof window.showWarningToast === 'function') return window.showWarningToast(message);
  alert(message);
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function freshSlots() {
  return { A: 0, B: 1, C: 2 };
}

function finalSlots(sequence = []) {
  const slots = freshSlots();
  for (const [a, b] of sequence) {
    const left = slots[a];
    slots[a] = slots[b];
    slots[b] = left;
  }
  return slots;
}

function formatTimer(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  return value >= 10 ? `${Math.ceil(value)}s` : `${value.toFixed(1)}s`;
}

class RedBallGame {
  constructor() {
    this.container = document.getElementById('shellgame-game');
    this.resetState();
    this.countdownTimer = null;
    this.autoSubmitTimer = null;
    this.autoAdvanceTimer = null;
    this.pendingEnableTimer = null;
    this.cupButtons = {};
  }

  resetState() {
    this.hasActivePass = false;
    this.passValidUntil = null;
    this.status = null;
    this.gameSessionId = null;
    this.difficulty = 'normal';
    this.totalRounds = 5;
    this.currentRound = 1;
    this.correctCount = 0;
    this.consecutiveStreak = 0;
    this.shuffleSequence = [];
    this.shuffleCount = 3;
    this.decisionTimerSeconds = 7;
    this.roundStartedAt = null;
    this.startingBallCupId = null;
    this.lastRoundResult = null;
    this.reward = null;
    this.rewardClaimed = false;
    this.gameResult = null;
    this.newStats = null;
    this.isProcessing = false;
    this.phase = 'selector';
    this.slots = freshSlots();
  }

  async init() {
    this.injectStyles();

    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    try {
      const user = await fetchUserData();
      updateTopBar(user);
    } catch (err) {
      console.warn('Red ball bootstrap failed:', err);
    }

    await this.loadPassStatus();
    const restored = await this.restoreSession();
    if (!restored) this.renderDifficultySelector();
  }

  injectStyles() {
    if (document.getElementById('redball-inline-styles')) return;
    const style = document.createElement('style');
    style.id = 'redball-inline-styles';
    style.textContent = `
      .redball-page .page-title{margin:8px auto 4px;color:#f6ead7;font-size:42px;line-height:1.05;font-family:'Comic Sans MS','Segoe Print','Bradley Hand',cursive}
      .redball-page .arcade-subtitle{max-width:430px;margin:0 auto 18px;color:#dbe6e0;font-size:20px;line-height:1.3;font-family:'Comic Sans MS','Segoe Print','Bradley Hand',cursive}
      .redball-shell.arcade-shell{max-width:620px;padding:18px;background:
        radial-gradient(circle at top left, rgba(255,92,121,.16), transparent 32%),
        radial-gradient(circle at top right, rgba(255,208,100,.12), transparent 24%),
        linear-gradient(180deg, rgba(9,26,38,.98), rgba(6,16,26,.99));border-color:rgba(255,215,140,.18)}
      .redball-grid{display:grid;gap:14px}
      .redball-note,.redball-panel,.redball-stage-card,.redball-table-card,.redball-stat-card,.redball-rule-card,.redball-feedback,.redball-reward{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);box-shadow:0 18px 36px rgba(0,0,0,.24)}
      .redball-note,.redball-panel,.redball-stage-card,.redball-table-card,.redball-rule-card,.redball-feedback,.redball-reward{border-radius:18px}
      .redball-note,.redball-panel,.redball-stage-card,.redball-table-card,.redball-rule-card,.redball-feedback,.redball-reward{padding:16px}
      .redball-note:before,.redball-panel:before,.redball-stage-card:before,.redball-table-card:before,.redball-rule-card:before,.redball-feedback:before,.redball-reward:before{content:'';position:absolute;inset:0;background:linear-gradient(135deg, rgba(255,255,255,.08), transparent 42%);pointer-events:none}
      .redball-hero{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(180px,.85fr);gap:16px;align-items:stretch}
      .redball-hero-copy{padding:22px;border-radius:22px;border:1px solid rgba(255,215,140,.16);background:
        radial-gradient(circle at 20% 20%, rgba(255,103,130,.20), transparent 36%),
        linear-gradient(155deg, rgba(26,51,70,.96), rgba(8,17,29,.99))}
      .redball-kicker{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.08);color:#ffe8a8;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
      .redball-kicker:before{content:'';width:8px;height:8px;border-radius:50%;background:#ff586d;box-shadow:0 0 14px rgba(255,88,109,.65)}
      .redball-hero-copy h2{margin:14px 0 10px;font-size:34px;line-height:1.05;color:#fff6de;text-align:left}
      .redball-hero-copy p{margin:0;color:#c9ddd6;text-align:left}
      .redball-hero-meta{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
      .redball-hero-meta span,.redball-mode-pill{display:inline-flex;align-items:center;justify-content:center;padding:9px 12px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#f8fbef;font-size:12px;font-weight:600}
      .redball-hero-art{position:relative;min-height:224px;border-radius:22px;border:1px solid rgba(255,215,140,.16);background:
        radial-gradient(circle at 50% 25%, rgba(255,255,255,.12), transparent 30%),
        radial-gradient(circle at 50% 80%, rgba(8,212,152,.22), transparent 46%),
        linear-gradient(180deg, rgba(10,29,42,.96), rgba(6,17,27,.99))}
      .redball-hero-art:after{content:'';position:absolute;left:12%;right:12%;bottom:28px;height:56px;border-radius:999px;background:radial-gradient(circle at 50% 50%, rgba(8,212,152,.32), rgba(8,212,152,.08) 55%, transparent 70%)}
      .redball-art-ball{position:absolute;left:50%;bottom:54px;width:34px;height:34px;border-radius:50%;transform:translateX(-50%);background:radial-gradient(circle at 30% 28%, rgba(255,255,255,.9), rgba(255,255,255,.1) 28%), linear-gradient(145deg, #ff738b, #c41637);box-shadow:0 0 24px rgba(255,88,109,.55)}
      .redball-art-cup{position:absolute;bottom:66px;width:74px;height:104px;border-radius:18px 18px 32px 32px;background:linear-gradient(180deg, #f0dcb8, #8e5330);box-shadow:0 16px 28px rgba(0,0,0,.35)}
      .redball-art-cup:before{content:'';position:absolute;top:-7px;left:50%;width:24px;height:15px;border-radius:999px;transform:translateX(-50%);background:#c88d5e}
      .redball-art-cup-left{left:18%}
      .redball-art-cup-mid{left:50%;transform:translateX(-50%) translateY(-8px)}
      .redball-art-cup-right{right:18%}
      .redball-pass-panel{text-align:left}
      .redball-pass-panel p,.redball-note p,.redball-level-copy,.redball-feedback p,.redball-rule-card p,.redball-panel p{margin:0;color:#c1d6ce}
      .redball-pass-panel strong{display:block;margin-bottom:8px;color:#fff3d6}
      .redball-pass-panel small{display:block;margin-top:8px;color:#88b8ab}
      .redball-pass-panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .redball-pass{display:inline-flex;align-items:center;gap:8px;width:fit-content;padding:7px 12px;border-radius:999px;background:rgba(0,255,170,.12);color:#dcfff4;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
      .redball-pass-dot{width:10px;height:10px;border-radius:50%;background:#00ffaa;box-shadow:0 0 16px rgba(0,255,170,.65)}
      .redball-selector-shell.redball-shell.arcade-shell{max-width:660px;padding:20px 18px 24px;color:#202a34;border-color:rgba(129,104,72,.45);background:
        linear-gradient(90deg, rgba(0,0,0,0) 0 38px, rgba(197,76,76,.28) 38px 40px, rgba(0,0,0,0) 40px),
        repeating-linear-gradient(180deg, rgba(103,136,178,.18) 0 1px, rgba(247,242,229,.98) 1px 36px),
        linear-gradient(180deg, rgba(247,242,229,.98), rgba(239,233,218,.98));box-shadow:0 18px 44px rgba(0,0,0,.28)}
      .redball-selector-shell .redball-panel,.redball-selector-shell .redball-stage-card,.redball-selector-shell .redball-note{border:2px solid rgba(60,56,51,.45);background:rgba(255,251,242,.84);box-shadow:0 8px 18px rgba(65,53,41,.08);border-radius:22px}
      .redball-selector-shell .redball-panel:before,.redball-selector-shell .redball-stage-card:before,.redball-selector-shell .redball-note:before{display:none}
      .redball-sketch-pass{text-align:center;padding:18px 16px}
      .redball-sketch-pass strong,.redball-sketch-pass small,.redball-sketch-heading,.redball-sketch-footer p,.redball-selector-shell .redball-level strong,.redball-selector-shell .redball-level-copy{font-family:'Comic Sans MS','Segoe Print','Bradley Hand',cursive}
      .redball-sketch-pass p,.redball-sketch-pass small,.redball-sketch-footer p{color:#2c3440}
      .redball-sketch-pass strong{color:#1f2630;font-size:24px;margin-bottom:6px}
      .redball-sketch-pass small{font-size:18px}
      .redball-selector-shell .redball-pass{margin:0 auto 10px;background:#1e2631;color:#fff4d7;border:1px solid rgba(30,38,49,.85)}
      .redball-selector-shell .redball-pass-dot{display:none}
      .redball-selector-shell .redball-pass-panel-head{justify-content:center;margin-bottom:6px}
      .redball-selector-shell .redball-actions{justify-content:center}
      .redball-selector-shell .redball-actions > *{flex:0 1 220px}
      .redball-sketch-stage{padding:8px 4px 0;border:0;background:transparent;box-shadow:none}
      .redball-sketch-heading{text-align:center;margin:2px 0 16px;font-size:34px;color:#1d2630}
      .redball-sketch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .redball-selector-shell .redball-level{min-height:170px;padding:20px 18px;border:2px solid rgba(58,53,49,.55);border-radius:28px;background:rgba(255,251,244,.94);color:#1e2833;box-shadow:0 6px 0 rgba(71,61,50,.18);transform:rotate(-1deg)}
      .redball-selector-shell .redball-level:hover,.redball-selector-shell .redball-level:focus-visible{transform:translateY(-2px) rotate(-1deg);border-color:rgba(58,53,49,.75);box-shadow:0 10px 0 rgba(71,61,50,.18)}
      .redball-selector-shell .redball-level:nth-child(2){transform:rotate(1deg)}
      .redball-selector-shell .redball-level:nth-child(2):hover,.redball-selector-shell .redball-level:nth-child(2):focus-visible{transform:translateY(-2px) rotate(1deg)}
      .redball-selector-shell .redball-level-hard{grid-column:1/-1;min-height:188px;transform:rotate(-.5deg)}
      .redball-selector-shell .redball-level-hard:hover,.redball-selector-shell .redball-level-hard:focus-visible{transform:translateY(-2px) rotate(-.5deg)}
      .redball-selector-shell .redball-level strong{font-size:30px;color:#1e2731}
      .redball-selector-shell .redball-level-tag{background:rgba(31,38,48,.08);color:#374455;border:1px dashed rgba(55,68,85,.4)}
      .redball-selector-shell .redball-level-copy{margin-top:12px;font-size:21px;line-height:1.45;color:#1e2731}
      .redball-selector-shell .redball-level small{margin-top:12px;font-size:14px;color:#46505e}
      .redball-sketch-footer{padding:14px 12px 6px;text-align:center}
      .redball-sketch-footer p{font-size:17px;line-height:1.5}
      .redball-section-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:14px}
      .redball-section-head h3{margin:0;color:#fff5dc;text-align:left}
      .redball-section-head p{margin:0;color:#9ec0b4;font-size:13px;text-align:right}
      .redball-buttons{display:grid;gap:12px}
      .redball-level{width:100%;padding:18px;border:1px solid rgba(255,215,140,.15);border-radius:20px;background:
        linear-gradient(160deg, rgba(20,43,59,.98), rgba(6,17,28,.99));color:#f5fff9;text-align:left;cursor:pointer;transition:transform .2s ease,border-color .2s ease,box-shadow .2s ease}
      .redball-level:hover,.redball-level:focus-visible{transform:translateY(-2px);border-color:rgba(255,215,140,.35);box-shadow:0 18px 34px rgba(0,0,0,.24)}
      .redball-level-top{display:flex;align-items:start;justify-content:space-between;gap:12px}
      .redball-level strong{display:block;font-size:20px;color:#fff3db}
      .redball-level-tag{padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.06);color:#ffe8a8;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
      .redball-level-copy{margin-top:10px}
      .redball-level small{display:block;margin-top:10px;color:#8fc0b0}
      .redball-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .redball-stat-card{padding:14px 12px;border-radius:18px;text-align:left}
      .redball-stat-card span{display:block;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8fb0a8;margin-bottom:8px}
      .redball-stat-card strong{display:block;font-size:22px;color:#fff6de}
      .redball-table-card{display:grid;gap:14px;background:linear-gradient(180deg, rgba(16,35,49,.95), rgba(8,20,31,.99))}
      .redball-table-head{display:flex;align-items:start;justify-content:space-between;gap:12px;text-align:left}
      .redball-table-head strong{display:block;color:#fff6de;font-size:20px}
      .redball-table-head p{margin:6px 0 0;color:#a9c8bf}
      .redball-track-wrap{position:relative}
      .redball-track{position:relative;height:280px;border-radius:26px;border:1px solid rgba(255,255,255,.08);background:
        radial-gradient(circle at 50% 72%, rgba(16,201,144,.32), transparent 44%),
        radial-gradient(circle at 50% 20%, rgba(255,255,255,.12), transparent 30%),
        linear-gradient(180deg, rgba(14,40,54,.98), rgba(8,22,33,.99));overflow:hidden}
      .redball-track:before{content:'';position:absolute;left:50%;top:18px;width:72%;height:110px;transform:translateX(-50%);background:radial-gradient(circle, rgba(255,255,255,.16), transparent 70%);pointer-events:none}
      .redball-track:after{content:'';position:absolute;left:16px;right:16px;bottom:30px;height:30px;border-radius:999px;background:linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.02))}
      .redball-track-rail{position:absolute;left:11%;right:11%;bottom:44px;height:10px;border-radius:999px;background:rgba(255,255,255,.12);box-shadow:0 0 0 1px rgba(255,255,255,.04)}
      .redball-track-light{position:absolute;top:20px;width:72px;height:72px;border-radius:50%;background:radial-gradient(circle, rgba(255,231,170,.32), transparent 65%);filter:blur(2px);pointer-events:none}
      .redball-track-light.left{left:12%}
      .redball-track-light.mid{left:50%;transform:translateX(-50%)}
      .redball-track-light.right{right:12%}
      .redball-cup{position:absolute;left:50%;top:56px;width:94px;padding:0;border:0;background:transparent;color:inherit;transform:translateX(calc(-50% + var(--cup-x, 0px)));transition:transform 180ms ease,opacity 180ms ease,filter 180ms ease;cursor:pointer}
      .redball-cup[disabled]{cursor:not-allowed}
      .redball-cup.is-disabled{opacity:.76}
      .redball-cup.is-picked{filter:drop-shadow(0 0 20px rgba(255,255,255,.18))}
      .redball-cup.is-picked .redball-cup-body{box-shadow:0 0 0 2px rgba(255,255,255,.2),0 20px 32px rgba(255,94,120,.3)}
      .redball-cup.is-correct .redball-cup-body{box-shadow:0 0 0 2px rgba(0,255,170,.45),0 20px 32px rgba(0,255,170,.25)}
      .redball-cup.is-wrong .redball-cup-body{box-shadow:0 0 0 2px rgba(255,98,124,.45),0 20px 32px rgba(255,98,124,.28)}
      .redball-cup-body{position:relative;width:100%;height:128px;border-radius:18px 18px 38px 38px;background:linear-gradient(180deg,#f3dfbc,#90532f);box-shadow:0 20px 28px rgba(0,0,0,.32)}
      .redball-cup-body:before{content:'';position:absolute;top:-8px;left:50%;width:28px;height:16px;border-radius:999px;transform:translateX(-50%);background:#cd9261}
      .redball-cup-shadow{position:absolute;left:50%;bottom:10px;width:72px;height:18px;border-radius:50%;transform:translateX(-50%);background:rgba(0,0,0,.24);filter:blur(4px)}
      .redball-cup-label{display:block;margin-top:14px;text-align:center;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#d8f4eb}
      .redball-ball{position:absolute;left:50%;bottom:-10px;width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 30% 28%, rgba(255,255,255,.95), rgba(255,255,255,.1) 26%), linear-gradient(145deg,#ff6b86,#c31432);transform:translateX(-50%);opacity:0;transition:opacity 160ms ease}
      .redball-cup.is-ball .redball-ball{opacity:1}
      .redball-table-foot{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,.85fr);gap:12px}
      .redball-feedback{display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left}
      .redball-feedback strong{display:block;color:#fff6de;margin-bottom:4px}
      .redball-badge{min-width:64px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.06);text-align:center;font-size:18px;font-weight:800;color:#fff4cf}
      .redball-progress{display:grid;gap:9px;padding:14px 16px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}
      .redball-progress-head{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#d6eee4}
      .redball-progress-bar{height:11px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
      .redball-progress-fill{height:100%;background:linear-gradient(90deg,#ff7a7a,#ffd56b,#00ffaa);transform-origin:left center}
      .redball-rule-card span{display:block;margin-bottom:8px;color:#8eb5aa;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
      .redball-actions{display:flex;gap:10px;flex-wrap:wrap}
      .redball-actions > *{flex:1 1 180px}
      .redball-reward{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#effff9}
      .redball-reward span:last-child{font-weight:800;color:#fff2cb}
      .redball-result-summary{display:grid;gap:12px}
      .redball-outcome-card h3{margin:0 0 8px;color:#fff4d4;font-size:28px}
      .redball-outcome-card p{margin:0;color:#c1d6ce}
      .redball-confetti{display:flex;justify-content:center;gap:10px;min-height:14px}
      .redball-confetti span{width:8px;height:18px;border-radius:999px;animation:redball-drop 1.1s ease-in-out infinite}
      .redball-confetti span:nth-child(1){background:#ff7188}
      .redball-confetti span:nth-child(2){background:#ffd15b;animation-delay:.1s}
      .redball-confetti span:nth-child(3){background:#00ffaa;animation-delay:.2s}
      .redball-confetti span:nth-child(4){background:#69d3ff;animation-delay:.3s}
      .redball-confetti span:nth-child(5){background:#fff27a;animation-delay:.4s}
      @keyframes redball-drop{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(18px) rotate(90deg);opacity:0}}
      .redball-page .page-title{margin:12px auto 6px;color:#ffffff;font-size:44px;line-height:1.05;font-family:'Poppins',Arial,sans-serif;font-weight:700}
      .redball-page .arcade-subtitle{max-width:430px;margin:0 auto 22px;color:#b3d9cc;font-size:17px;line-height:1.45;font-family:'Poppins',Arial,sans-serif}
      .redball-selector-shell.redball-shell.arcade-shell{max-width:520px;padding:10px 6px 18px;color:#ffffff;border:0;background:transparent;box-shadow:none}
      .redball-selector-shell .redball-panel,.redball-selector-shell .redball-stage-card,.redball-selector-shell .redball-note{border:0;background:transparent;box-shadow:none;border-radius:0}
      .redball-selector-shell .redball-panel:before,.redball-selector-shell .redball-stage-card:before,.redball-selector-shell .redball-note:before{display:none}
      .redball-sketch-pass{max-width:320px;margin:0 auto 8px;padding:14px 16px;text-align:center;border:1px solid rgba(0,255,170,.22) !important;border-radius:12px !important;background:linear-gradient(135deg, rgba(0,50,100,.9), rgba(0,30,60,.95)) !important;box-shadow:0 0 15px rgba(0,255,170,.14) !important}
      .redball-sketch-pass strong,.redball-sketch-pass small,.redball-sketch-heading,.redball-sketch-footer p,.redball-selector-shell .redball-level strong,.redball-selector-shell .redball-level-copy{font-family:'Poppins',Arial,sans-serif}
      .redball-selector-shell .redball-pass-panel-head{justify-content:center;margin-bottom:6px}
      .redball-selector-shell .redball-pass{margin:0 auto;background:transparent;border:0;padding:0;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0;text-transform:none}
      .redball-selector-shell .redball-pass-dot{display:none}
      .redball-sketch-pass small{display:block;margin-top:6px;font-size:14px;color:#b3d9cc}
      .redball-sketch-stage{padding:0}
      .redball-sketch-heading{text-align:center;margin:18px 0 16px;font-size:18px;color:#00ffaa}
      .redball-sketch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;padding:0 10px}
      .redball-selector-shell .redball-level{min-height:132px;padding:16px 14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;border:2px solid rgba(0,255,170,.2) !important;border-radius:14px !important;background:linear-gradient(135deg, rgba(0,50,100,.9), rgba(0,30,60,.95)) !important;color:#b3d9cc !important;box-shadow:0 0 15px rgba(0,255,170,.18) !important;transform:none}
      .redball-selector-shell .redball-level:hover,.redball-selector-shell .redball-level:focus-visible,.redball-selector-shell .redball-level:nth-child(2):hover,.redball-selector-shell .redball-level:nth-child(2):focus-visible,.redball-selector-shell .redball-level-hard:hover,.redball-selector-shell .redball-level-hard:focus-visible{transform:translateY(-2px);border-color:rgba(0,255,170,.6) !important;background:linear-gradient(135deg, rgba(0,80,120,.95), rgba(0,50,80,.98)) !important;box-shadow:0 0 18px rgba(0,255,170,.28) !important}
      .redball-selector-shell .redball-level:nth-child(2),.redball-selector-shell .redball-level-hard{transform:none}
      .redball-selector-shell .redball-level-hard{grid-column:1/-1}
      .redball-level-icon{font-size:32px;line-height:1}
      .redball-selector-shell .redball-level-top{display:block}
      .redball-selector-shell .redball-level strong{font-size:16px;color:#ffffff}
      .redball-selector-shell .redball-level-copy{margin-top:0;font-size:14px;line-height:1.4;color:#d9f4ea}
      .redball-selector-shell .redball-level-tag,.redball-selector-shell .redball-level small{display:none}
      .redball-sketch-footer{padding:10px 16px 0;text-align:center}
      .redball-sketch-footer p{font-size:13px;line-height:1.45;color:#b3d9cc}
      @media (max-width:560px){
        .redball-page .page-title{font-size:36px}
        .redball-page .arcade-subtitle{font-size:16px}
        .redball-sketch-grid{gap:14px;padding:0 6px}
        .redball-selector-shell .redball-level{min-height:122px}
        .redball-hero,.redball-table-foot{grid-template-columns:1fr}
        .redball-hero-copy h2{font-size:28px}
        .redball-top{grid-template-columns:1fr}
        .redball-track{height:252px}
        .redball-cup{width:82px;top:62px}
        .redball-cup-body{height:114px}
      }
    `;
    document.head.appendChild(style);
  }

  clearTimers() {
    clearInterval(this.countdownTimer);
    clearTimeout(this.autoSubmitTimer);
    clearTimeout(this.autoAdvanceTimer);
    clearTimeout(this.pendingEnableTimer);
    this.countdownTimer = null;
    this.autoSubmitTimer = null;
    this.autoAdvanceTimer = null;
    this.pendingEnableTimer = null;
  }

  async loadPassStatus() {
    try {
      const res = await fetch('/api/games/shellgame/status', { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (res.ok) {
        this.hasActivePass = Boolean(data?.hasActivePass);
        this.passValidUntil = data?.passValidUntil || null;
      }
    } catch (_) {
      this.hasActivePass = false;
      this.passValidUntil = null;
    }
  }

  saveSessionId() {
    if (!this.gameSessionId) return;
    try { localStorage.setItem(STORAGE_KEY, this.gameSessionId); } catch (_) {}
  }

  loadSessionId() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }

  clearSessionId() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  syncSession(data = {}) {
    this.status = data.status || this.status;
    this.gameSessionId = data.gameSessionId || this.gameSessionId;
    this.difficulty = data.difficulty || this.difficulty;
    this.totalRounds = Number(data.totalRounds || this.totalRounds || 5);
    this.currentRound = Number(data.currentRound || this.currentRound || 1);
    this.correctCount = Number(data.correctCount || 0);
    this.consecutiveStreak = Number(data.consecutiveStreak || 0);
    this.shuffleSequence = Array.isArray(data.shuffleSequence) ? data.shuffleSequence : [];
    this.shuffleCount = Number(data.shuffleCount || this.shuffleCount || 3);
    this.decisionTimerSeconds = Number(data.decisionTimerSeconds || this.decisionTimerSeconds || 7);
    this.roundStartedAt = data.roundStartedAt || null;
    this.startingBallCupId = data.startingBallCupId || null;
    this.lastRoundResult = data.lastRoundResult || null;
    this.reward = data.reward || this.reward;
    this.rewardClaimed = Boolean(data.rewardClaimed);
    this.gameResult = data.gameResult || null;
  }

  syncRound(data = {}) {
    this.currentRound = Number(data.currentRound || this.currentRound || 1);
    this.shuffleSequence = Array.isArray(data.shuffleSequence) ? data.shuffleSequence : [];
    this.shuffleCount = Number(data.shuffleCount || this.shuffleCount || 3);
    this.decisionTimerSeconds = Number(data.decisionTimerSeconds || this.decisionTimerSeconds || 7);
    this.roundStartedAt = data.roundStartedAt || null;
    this.startingBallCupId = data.startingBallCupId || null;
    this.lastRoundResult = null;
    this.gameResult = null;
    this.status = 'active';
    this.slots = freshSlots();
  }

  getDifficultyLabel(value = this.difficulty) {
    if (value === 'easy') return t('shellgame.easy_label', 'Easy');
    if (value === 'hard') return t('shellgame.hard_label', 'Hard');
    return t('shellgame.normal_label', 'Normal');
  }

  getPassMarkup({ allowPurchase = true } = {}) {
    if (this.hasActivePass) {
      return `
        <div class="redball-panel redball-pass-panel redball-sketch-pass">
          <div class="redball-pass-panel-head">
            <span class="redball-pass">Pass Active</span>
            <span class="redball-pass-dot" aria-hidden="true"></span>
          </div>
          <small>${this.passValidUntil ? `until ${new Date(this.passValidUntil).toLocaleString()}` : 'Pass is active now.'}</small>
        </div>
      `;
    }

    return `
      <div class="redball-panel redball-pass-panel redball-sketch-pass">
        <strong>${t('shellgame.pass_title', 'Daily pass needed')}</strong>
        <p>${t('shellgame.pass_copy', 'Red ball uses the shared daily arcade pass.')}</p>
        ${allowPurchase ? `<div class="redball-actions" style="margin-top:12px"><button type="button" class="btn-primary" id="redball-buy-pass">${t('shellgame.buy_pass', 'Purchase Pass')}</button></div>` : ''}
      </div>
    `;
  }

  getModeMeta() {
    if (this.difficulty === 'easy') return 'Steady table';
    if (this.difficulty === 'hard') return 'High pressure';
    return 'Streak mode';
  }

  getDifficultyCardsMarkup() {
    return `
      <button class="redball-level redball-level-easy" data-difficulty="easy">
        <span class="redball-level-icon" aria-hidden="true">🌱</span>
        <div class="redball-level-top">
          <strong>${t('shellgame.easy_label', 'Easy')}</strong>
        </div>
        <div class="redball-level-copy">${t('shellgame.easy_goal', 'Find the red ball at least 3 times in 5 rounds.')}</div>
      </button>
      <button class="redball-level redball-level-normal" data-difficulty="normal">
        <span class="redball-level-icon" aria-hidden="true">⚡</span>
        <div class="redball-level-top">
          <strong>${t('shellgame.normal_label', 'Normal')}</strong>
        </div>
        <div class="redball-level-copy">${t('shellgame.normal_goal', 'Find the red ball 3 times in a row.')}</div>
      </button>
      <button class="redball-level redball-level-hard" data-difficulty="hard">
        <span class="redball-level-icon" aria-hidden="true">🔥</span>
        <div class="redball-level-top">
          <strong>${t('shellgame.hard_label', 'Hard')}</strong>
        </div>
        <div class="redball-level-copy">${t('shellgame.hard_goal', 'Go 5 for 5. One wrong cup means game over.')}</div>
      </button>
    `;
  }

  async restoreSession() {
    const savedId = this.loadSessionId();
    if (!savedId) return false;

    try {
      const res = await fetch(`/api/games/shellgame/session/${savedId}`, { credentials: 'include', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Session unavailable');
      this.syncSession(data);
      if (!this.gameSessionId) this.gameSessionId = savedId;

      if (this.status === 'active') {
        if (data.roundResolved && this.lastRoundResult) this.renderResult();
        else this.renderRound({ resume: true });
        return true;
      }

      if (!(this.status === 'completed' && this.gameResult === 'win' && !this.rewardClaimed)) {
        this.clearSessionId();
      }
      this.renderGameOver();
      return true;
    } catch (err) {
      console.warn('Red ball session restore failed:', err);
      this.clearSessionId();
      return false;
    }
  }

  renderDifficultySelector() {
    if (!this.container) return;
    this.clearTimers();
    this.phase = 'selector';
    const sketchPassMarkup = this.getPassMarkup();

    this.container.innerHTML = `
      <div class="arcade-shell redball-shell redball-selector-shell redball-grid">
        ${sketchPassMarkup}
        <div class="redball-stage-card redball-sketch-stage">
          <h3 class="redball-sketch-heading">${t('shellgame.select_difficulty', 'Select Difficulty')}</h3>
          <div class="redball-sketch-grid">${this.getDifficultyCardsMarkup()}</div>
        </div>
        <div class="redball-note redball-sketch-footer"><p>${t('shellgame.rules_copy', 'The server keeps the answer hidden until after your guess. You only see the opening reveal and the shuffle sequence.')}</p></div>
      </div>
    `;

    this.container.querySelectorAll('[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => this.startGame(button.dataset.difficulty));
    });
    this.container.querySelector('#redball-buy-pass')?.addEventListener('click', () => navigateWithFeedback('gamepass.html?game=shellgame'));
    return;
    const passMarkupNew = this.getPassMarkup();

    this.container.innerHTML = `
      <div class="arcade-shell redball-shell redball-grid">
        <section class="redball-hero">
          <div class="redball-hero-copy">
            <span class="redball-kicker">Arcade table</span>
            <h2>${t('shellgame.title', 'Red ball')}</h2>
            <p>${t('shellgame.hero_copy', 'A sharper casino-style layout for quick reads: watch the reveal, track the shuffle, and trust your final pick.')}</p>
            <div class="redball-hero-meta">
              <span>3 cups</span>
              <span>5 rounds</span>
              <span>${this.getDifficultyLabel()}</span>
            </div>
          </div>
          <div class="redball-hero-art" aria-hidden="true">
            <span class="redball-art-ball"></span>
            <span class="redball-art-cup redball-art-cup-left"></span>
            <span class="redball-art-cup redball-art-cup-mid"></span>
            <span class="redball-art-cup redball-art-cup-right"></span>
          </div>
        </section>
        ${passMarkupNew}
        <div class="redball-stage-card difficulty-selector" style="padding:18px">
          <div class="redball-section-head">
            <h3>${t('shellgame.select_difficulty', 'Choose your table')}</h3>
            <p>${t('shellgame.mode_hint', 'Each mode changes the pace and win rule.')}</p>
          </div>
          <div class="redball-buttons">${this.getDifficultyCardsMarkup()}</div>
        </div>
        <div class="redball-note"><p>${t('shellgame.rules_copy', 'The server keeps the answer hidden until after your guess. You only see the opening reveal and the shuffle sequence.')}</p></div>
      </div>
    `;

    this.container.querySelectorAll('[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => this.startGame(button.dataset.difficulty));
    });
    this.container.querySelector('#redball-buy-pass')?.addEventListener('click', () => navigateWithFeedback('gamepass.html?game=shellgame'));
    return;
    const passMarkup = this.getPassMarkup();

    this.container.innerHTML = `
      <div class="arcade-shell redball-grid">
        ${passMarkup}
        <div class="difficulty-selector" style="padding:0">
          <h3>${t('shellgame.select_difficulty', 'Choose your table')}</h3>
          <div class="redball-buttons">
            <button class="redball-level" data-difficulty="easy"><strong>${t('shellgame.easy_label', 'Easy')}</strong>${t('shellgame.easy_goal', 'Find the red ball at least 3 times in 5 rounds.')}<small>${t('shellgame.easy_meta', '3 swaps per round · 6 second pick window')}</small></button>
            <button class="redball-level" data-difficulty="normal"><strong>${t('shellgame.normal_label', 'Normal')}</strong>${t('shellgame.normal_goal', 'Build a 3-in-a-row streak before the 5 rounds run out.')}<small>${t('shellgame.normal_meta', '5 swaps per round · 4 second pick window')}</small></button>
            <button class="redball-level" data-difficulty="hard"><strong>${t('shellgame.hard_label', 'Hard')}</strong>${t('shellgame.hard_goal', 'Go 5 for 5. One wrong cup ends the run instantly.')}<small>${t('shellgame.hard_meta', '7 swaps per round · 2.5 second pick window')}</small></button>
          </div>
        </div>
        <div class="redball-note"><p>${t('shellgame.rules_copy', 'The server keeps the answer hidden until after your guess. You only see the opening reveal and the shuffle sequence.')}</p></div>
      </div>
    `;

    this.container.querySelectorAll('[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => this.startGame(button.dataset.difficulty));
    });
    this.container.querySelector('#redball-buy-pass')?.addEventListener('click', () => navigateWithFeedback('gamepass.html?game=shellgame'));
  }

  async startGame(difficulty = 'normal') {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const res = await fetch('/api/games/shellgame/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty })
      });
      const data = await res.json();
      if (res.status === 402) return navigateWithFeedback('gamepass.html?game=shellgame');
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to start Red ball');

      this.resetState();
      this.status = 'active';
      this.gameSessionId = data.gameSessionId;
      this.difficulty = difficulty;
      this.totalRounds = Number(data.totalRounds || 5);
      this.syncRound(data);
      this.saveSessionId();
      this.renderRound();
    } catch (err) {
      console.error('Red ball start failed:', err);
      showNotification(err.message || 'Failed to start Red ball', 'error');
    } finally {
      this.isProcessing = false;
    }
  }

  getTopCards() {
    const streakLabelNew = this.difficulty === 'normal' ? 'Streak' : 'Table';
    const streakValueNew = this.difficulty === 'normal' ? `${this.consecutiveStreak}x` : this.getDifficultyLabel();
    return `
      <div class="redball-top">
        <div class="redball-stat-card"><span>Round</span><strong>${this.currentRound}/${this.totalRounds}</strong></div>
        <div class="redball-stat-card"><span>Correct</span><strong>${this.correctCount}/${this.totalRounds}</strong></div>
        <div class="redball-stat-card"><span>${streakLabelNew}</span><strong>${streakValueNew}</strong></div>
      </div>
    `;
    const streakLabel = this.difficulty === 'normal' ? 'Streak' : 'Mode';
    const streakValue = this.difficulty === 'normal' ? this.consecutiveStreak : this.difficulty;
    return `
      <div class="redball-top">
        <div class="arcade-chip"><span>Round</span><strong>${this.currentRound}/${this.totalRounds}</strong></div>
        <div class="arcade-chip"><span>Correct</span><strong>${this.correctCount}/${this.totalRounds}</strong></div>
        <div class="arcade-chip"><span>${streakLabel}</span><strong>${streakValue}</strong></div>
      </div>
    `;
  }

  renderTrack() {
    return `
      <div class="redball-track-wrap">
        <div class="redball-track" id="redball-track">
          <span class="redball-track-light left" aria-hidden="true"></span>
          <span class="redball-track-light mid" aria-hidden="true"></span>
          <span class="redball-track-light right" aria-hidden="true"></span>
          <span class="redball-track-rail" aria-hidden="true"></span>
          ${CUPS.map((cupId) => `
            <button type="button" class="redball-cup is-disabled" data-cup-id="${cupId}" disabled>
              <span class="redball-cup-body"><span class="redball-ball"></span></span>
              <span class="redball-cup-shadow" aria-hidden="true"></span>
              <span class="redball-cup-label">${cupId}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
    return `
      <div class="redball-track" id="redball-track">
        ${CUPS.map((cupId) => `
          <button type="button" class="redball-cup is-disabled" data-cup-id="${cupId}" disabled>
            <span class="redball-cup-body"><span class="redball-ball"></span></span>
            <span class="redball-cup-label">${cupId}</span>
          </button>
        `).join('')}
      </div>
    `;
  }

  cacheButtons() {
    this.cupButtons = {};
    this.container.querySelectorAll('.redball-cup[data-cup-id]').forEach((button) => {
      this.cupButtons[button.dataset.cupId] = button;
      button.addEventListener('click', () => this.submitGuess(button.dataset.cupId));
    });
  }

  applyPositions(animated = true, duration = this.getStepMs()) {
    const offsets = this.getCupOffsets();
    Object.entries(this.cupButtons).forEach(([cupId, button]) => {
      button.style.transitionDuration = animated ? `${duration}ms` : '0ms';
      button.style.setProperty('--cup-x', `${offsets[this.slots[cupId] || 0]}px`);
    });
  }

  getCupOffsets() {
    const track = this.container?.querySelector('#redball-track');
    const firstCup = this.container?.querySelector('.redball-cup');
    const trackWidth = Math.max(260, Number(track?.clientWidth || 0));
    const cupWidth = Math.max(72, Number(firstCup?.offsetWidth || 0));
    const edgePadding = Math.max(18, Math.round(trackWidth * 0.08));
    const offset = Math.max(54, Math.floor((trackWidth - cupWidth - (edgePadding * 2)) / 2));
    return [-offset, 0, offset];
  }

  setBall(cupId = null) {
    Object.entries(this.cupButtons).forEach(([id, button]) => button.classList.toggle('is-ball', id === cupId));
  }

  setFeedback(title, copy, badge) {
    const titleEl = this.container.querySelector('#redball-title');
    const copyEl = this.container.querySelector('#redball-copy');
    const badgeEl = this.container.querySelector('#redball-badge');
    if (titleEl) titleEl.textContent = title;
    if (copyEl) copyEl.textContent = copy;
    if (badgeEl) badgeEl.textContent = badge;
  }

  getStepMs() {
    return Math.max(320, Math.round(2100 / Math.max(1, this.shuffleCount)));
  }

  renderRound({ resume = false } = {}) {
    if (!this.container) return;
    this.clearTimers();
    this.phase = 'armed';
    this.slots = freshSlots();

    this.container.innerHTML = `
      <div class="arcade-shell redball-shell redball-grid">
        ${this.getPassMarkup({ allowPurchase: false })}
        ${this.getTopCards()}
        <div class="redball-table-card">
          <div class="redball-table-head">
            <div><strong id="redball-title">Track the red ball</strong><p id="redball-copy">Start the round when you are ready, Watch the reveal, follow the shuffle.</p></div>
            <div class="redball-mode-pill">${this.getModeMeta()}</div>
          </div>
          ${this.renderTrack()}
          <div class="redball-table-foot">
            <div class="redball-progress">
              <div class="redball-progress-head"><span>Decision window</span><span id="redball-timer">${formatTimer(this.decisionTimerSeconds)}</span></div>
              <div class="redball-progress-bar"><div class="redball-progress-fill" id="redball-fill"></div></div>
            </div>
            <div class="redball-rule-card"><span>Win rule</span><p>${this.getModeRule()}</p></div>
          </div>
        </div>
        <div class="redball-feedback">
          <div><strong>${t('shellgame.table_status', 'Round control')}</strong><p>${t('shellgame.table_status_copy', 'You now start each round manually, so the table waits for you before anything moves.')}</p></div>
          <div class="redball-badge" id="redball-badge">Ready</div>
        </div>
        <div class="redball-actions">
          <button type="button" class="btn-primary" id="redball-start-round">Start Round</button>
          <button type="button" class="btn-leave-game btn-abandon" id="redball-leave">Leave Game</button>
        </div>
      </div>
    `;

    this.cacheButtons();
    this.applyPositions(false);
    const fillEl = this.container.querySelector('#redball-fill');
    if (fillEl) fillEl.style.transform = 'scaleX(1)';
    Object.values(this.cupButtons).forEach((button) => {
      button.disabled = true;
      button.classList.add('is-disabled');
    });
    this.container.querySelector('#redball-start-round')?.addEventListener('click', () => this.beginRound());
    this.container.querySelector('#redball-leave')?.addEventListener('click', () => this.abandonGame(true));

    if (resume && this.roundStartedAt) {
      this.slots = finalSlots(this.shuffleSequence);
      this.applyPositions(false);
      this.enableGuessing();
    }
  }

  async beginRound() {
    if (this.isProcessing || this.phase === 'shuffling' || this.phase === 'guessing') return;
    this.isProcessing = true;
    const startButton = this.container.querySelector('#redball-start-round');
    if (startButton) {
      startButton.disabled = true;
      startButton.textContent = 'Starting...';
    }

    try {
      const res = await fetch('/api/games/shellgame/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSessionId: this.gameSessionId, action: 'begin_round' })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to begin the round');

      this.roundStartedAt = data.roundStartedAt || this.roundStartedAt;
      this.phase = 'shuffling';
      this.setFeedback('Ball is revealed', 'Lock in the opening cup, then follow the slower shuffle carefully.', 'Open');
      await this.playIntro();
    } catch (err) {
      console.error('Red ball begin round failed:', err);
      if (startButton) {
        startButton.disabled = false;
        startButton.textContent = 'Start Round';
      }
      showNotification(err.message || 'Failed to begin the round', 'error');
    } finally {
      this.isProcessing = false;
    }
  }

  async playIntro() {
    this.phase = 'shuffling';
    this.setFeedback('Ball is revealed', 'Lock in the starting cup before the table starts moving.', 'Open');
    this.setBall(this.startingBallCupId);
    await delay(ROUND_REVEAL_MS);
    this.setBall(null);
    await delay(ROUND_HIDE_MS);
    await this.animateSequence();
    this.enableGuessing();
  }

  async animateSequence() {
    const step = this.getStepMs();
    for (const [a, b] of this.shuffleSequence) {
      const left = this.slots[a];
      this.slots[a] = this.slots[b];
      this.slots[b] = left;
      this.applyPositions(true, step);
      await delay(step + ROUND_SWAP_GAP_MS);
    }
  }

  enableGuessing() {
    this.phase = 'guessing';
    this.setFeedback('Choose your cup', 'The shuffle is over. Tap the cup holding the red ball before the timer runs out.', 'Pick');
    const startButton = this.container.querySelector('#redball-start-round');
    if (startButton) {
      startButton.disabled = true;
      startButton.textContent = 'Round Live';
    }

    const waitMs = Math.max(0, new Date(this.roundStartedAt || Date.now()).getTime() - Date.now());
    this.pendingEnableTimer = window.setTimeout(() => {
      Object.values(this.cupButtons).forEach((button) => {
        button.disabled = false;
        button.classList.remove('is-disabled');
      });
      this.startCountdown();
    }, waitMs);
  }

  startCountdown() {
    clearInterval(this.countdownTimer);
    clearTimeout(this.autoSubmitTimer);

    const timerEl = this.container.querySelector('#redball-timer');
    const fillEl = this.container.querySelector('#redball-fill');
    const deadline = new Date(this.roundStartedAt || Date.now()).getTime() + (this.decisionTimerSeconds * 1000);

    const tick = () => {
      const remainingMs = Math.max(0, deadline - Date.now());
      const remainingSeconds = remainingMs / 1000;
      if (timerEl) timerEl.textContent = formatTimer(remainingSeconds);
      if (fillEl) fillEl.style.transform = `scaleX(${Math.max(0, Math.min(1, remainingSeconds / this.decisionTimerSeconds))})`;

      if (remainingMs <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.autoSubmitTimer = window.setTimeout(() => {
          if (this.phase === 'guessing' && !this.isProcessing) this.submitGuess(null, { auto: true });
        }, ROUND_TIMEOUT_BUFFER_MS);
      }
    };

    tick();
    this.countdownTimer = window.setInterval(tick, 80);
  }

  async submitGuess(cupId, { auto = false } = {}) {
    if (this.phase !== 'guessing' || this.isProcessing) return;
    this.isProcessing = true;
    this.clearTimers();

    Object.values(this.cupButtons).forEach((button) => {
      button.disabled = true;
      button.classList.add('is-disabled');
    });
    if (cupId && this.cupButtons[cupId]) this.cupButtons[cupId].classList.add('is-picked');

    try {
      const res = await fetch('/api/games/shellgame/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameSessionId: this.gameSessionId,
          action: 'guess',
          guessedCupId: cupId,
          timedOut: auto || !cupId
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to submit your guess');

      this.correctCount = Number(data.correctCount || 0);
      this.consecutiveStreak = Number(data.consecutiveStreak || 0);
      this.gameResult = data.gameResult || null;
      this.reward = data.reward || this.reward;
      this.lastRoundResult = {
        ...(data.roundResult || {}),
        guessedCupId: data.roundResult?.guessedCupId ?? cupId,
        correctCupId: data.correctCupId
      };
      this.status = data.gameOver ? 'completed' : 'active';

      if (data.gameOver) {
        if (this.gameResult !== 'win') this.clearSessionId();
        this.renderGameOver();
      } else {
        this.renderResult();
      }
    } catch (err) {
      console.error('Red ball guess failed:', err);
      showNotification(err.message || 'Failed to submit your guess', auto ? 'warn' : 'error');
      this.phase = 'guessing';
      Object.values(this.cupButtons).forEach((button) => {
        button.disabled = false;
        button.classList.remove('is-disabled', 'is-picked');
      });
      this.startCountdown();
    } finally {
      this.isProcessing = false;
    }
  }

  renderResult() {
    if (!this.container) return;
    this.clearTimers();
    this.phase = 'result';
    this.slots = finalSlots(this.shuffleSequence);

    const guessedCupId = this.lastRoundResult?.guessedCupId || null;
    const correctCupId = this.lastRoundResult?.correctCupId || null;
    const timedOut = Boolean(this.lastRoundResult?.timedOut);
    const title = this.lastRoundResult?.correct ? 'Clean read' : timedOut ? 'Too late' : 'Not this time';
    const copy = this.lastRoundResult?.correct
      ? 'You tracked the right cup and stayed composed.'
      : timedOut
        ? 'The timer closed the round before you locked in a cup.'
        : 'The red ball slipped elsewhere after the shuffle.';

    this.container.innerHTML = `
      <div class="arcade-shell redball-shell redball-grid">
        ${this.getPassMarkup({ allowPurchase: false })}
        ${this.getTopCards()}
        <div class="redball-feedback">
          <div><strong>${title}</strong><p>${copy}</p></div>
          <div class="redball-badge">${this.lastRoundResult?.correct ? 'OK' : timedOut ? '00' : 'NO'}</div>
        </div>
        <div class="redball-table-card">
          <div class="redball-table-head">
            <div><strong>${this.lastRoundResult?.correct ? 'Read confirmed' : 'Answer revealed'}</strong><p>${timedOut ? 'The timer closed before your pick landed.' : 'The table is showing where the red ball finished.'}</p></div>
            <div class="redball-mode-pill">${this.getModeMeta()}</div>
          </div>
          ${this.renderTrack()}
          <div class="redball-table-foot">
            <div class="redball-rule-card"><span>Progress</span><p>${this.correctCount}/${this.totalRounds} correct so far${this.difficulty === 'normal' ? ` / Streak ${this.consecutiveStreak}` : ''}</p></div>
            <div class="redball-rule-card"><span>Next step</span><p>Set up the next round when you are ready. It will wait for your manual start.</p></div>
          </div>
        </div>
        <div class="redball-actions">
          <button type="button" class="btn-primary" id="redball-next">Next Round</button>
          <button type="button" class="btn-leave-game btn-abandon" id="redball-leave-result">Leave Game</button>
        </div>
      </div>
    `;

    this.cacheButtons();
    this.applyPositions(false);
    this.setBall(correctCupId);
    Object.values(this.cupButtons).forEach((button) => {
      button.disabled = true;
      button.classList.add('is-disabled');
    });
    if (guessedCupId && this.cupButtons[guessedCupId]) {
      this.cupButtons[guessedCupId].classList.add('is-picked');
      this.cupButtons[guessedCupId].classList.add(this.lastRoundResult?.correct ? 'is-correct' : 'is-wrong');
    }
    if (correctCupId && this.cupButtons[correctCupId]) this.cupButtons[correctCupId].classList.add('is-correct');

    this.container.querySelector('#redball-next')?.addEventListener('click', () => this.nextRound());
    this.container.querySelector('#redball-leave-result')?.addEventListener('click', () => this.abandonGame(true));
    return;

    this.container.innerHTML = `
      <div class="arcade-shell redball-grid">
        ${this.getTopCards()}
        <div class="redball-feedback">
          <div><strong>${title}</strong><p>${copy}</p></div>
          <div class="redball-badge">${this.lastRoundResult?.correct ? 'OK' : timedOut ? '00' : 'NO'}</div>
        </div>
        ${this.renderTrack()}
        <div class="redball-panel"><p>${this.correctCount}/${this.totalRounds} correct so far${this.difficulty === 'normal' ? ` · Streak ${this.consecutiveStreak}` : ''}</p></div>
        <div class="redball-actions">
          <button type="button" class="btn-primary" id="redball-next">Next Round</button>
          <button type="button" class="btn-leave-game btn-abandon" id="redball-leave-result">Leave Game</button>
        </div>
      </div>
    `;

    this.cacheButtons();
    this.applyPositions(false);
    this.setBall(correctCupId);
    Object.values(this.cupButtons).forEach((button) => {
      button.disabled = true;
      button.classList.add('is-disabled');
    });
    if (guessedCupId && this.cupButtons[guessedCupId]) {
      this.cupButtons[guessedCupId].classList.add('is-picked');
      this.cupButtons[guessedCupId].classList.add(this.lastRoundResult?.correct ? 'is-correct' : 'is-wrong');
    }
    if (correctCupId && this.cupButtons[correctCupId]) this.cupButtons[correctCupId].classList.add('is-correct');

    this.container.querySelector('#redball-next')?.addEventListener('click', () => this.nextRound());
    this.container.querySelector('#redball-leave-result')?.addEventListener('click', () => this.abandonGame(true));
    this.autoAdvanceTimer = window.setTimeout(() => this.nextRound(), 1500);
  }

  async nextRound() {
    if (this.phase !== 'result' || this.isProcessing || this.gameResult) return;
    this.isProcessing = true;
    this.clearTimers();

    try {
      const res = await fetch('/api/games/shellgame/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSessionId: this.gameSessionId, action: 'new_round' })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to load the next round');
      this.syncRound(data);
      this.renderRound();
    } catch (err) {
      console.error('Red ball next round failed:', err);
      showNotification(err.message || 'Failed to load the next round', 'error');
    } finally {
      this.isProcessing = false;
    }
  }

  getModeRule() {
    if (this.difficulty === 'hard') return 'Hard ends on the first wrong cup. A perfect 5 for 5 is the only win path.';
    if (this.difficulty === 'normal') return 'Normal needs a 3-correct streak. One miss resets the streak to zero.';
    return 'Easy lets you win with any 3 correct picks across the 5 rounds.';
  }

  getRewardItems() {
    const reward = this.reward || {};
    const items = [
      { label: t('flipcards.points_label', 'Points'), value: Number(reward.points || 0) },
      { label: t('flipcards.xp_label', 'XP'), value: Number(reward.xp || 0) }
    ];
    if (Number(reward.bronzeTickets || 0)) items.push({ label: t('flipcards.bronze_tickets', 'Bronze Tickets'), value: Number(reward.bronzeTickets || 0) });
    if (Number(reward.silverTickets || 0)) items.push({ label: t('flipcards.silver_tickets', 'Silver Tickets'), value: Number(reward.silverTickets || 0) });
    if (Number(reward.goldTickets || 0)) items.push({ label: t('flipcards.gold_tickets', 'Gold Tickets'), value: Number(reward.goldTickets || 0) });
    return items;
  }

  renderGameOver() {
    if (!this.container) return;
    this.clearTimers();
    this.phase = 'gameover';

    const win = this.gameResult === 'win';
    const claimed = win && this.rewardClaimed;
    const rewardMarkup = win
      ? this.getRewardItems().map((item) => `<div class="redball-reward"><span>${item.label}</span><span>+${item.value}</span></div>`).join('')
      : '';
    const statsMarkup = this.newStats
      ? `<div class="redball-panel"><p>${t('flipcards.total_points', 'Total Points:')} ${Number(this.newStats.points || 0)}<br>${t('flipcards.level_label', 'Level:')} ${this.newStats.level || '-'}</p></div>`
      : '';

    this.container.innerHTML = `
      <div class="arcade-shell redball-shell redball-grid">
        ${this.getPassMarkup({ allowPurchase: false })}
        ${this.getTopCards()}
        ${win ? '<div class="redball-confetti" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' : ''}
        <div class="redball-panel redball-outcome-card game-outcome">
          <h3>${win ? 'Table beaten' : 'Run over'}</h3>
          <p>${win ? (claimed ? 'The reward has already been banked to your profile.' : 'You tracked the red ball and earned the win. Claim the reward to finish the run.') : 'The cups got the better of this run, but you can jump straight back in.'}</p>
        </div>
        <div class="redball-result-summary">
          <div class="redball-panel"><p>Final score: ${this.correctCount}/${this.totalRounds}${this.difficulty === 'normal' ? ` / Ending streak ${this.consecutiveStreak}` : ''}</p></div>
          <div class="redball-panel"><p>${win ? 'The pass box stays visible here so the result still feels tied to the same active table.' : 'Reset and run it again whenever you are ready.'}</p></div>
        </div>
        ${rewardMarkup}
        ${statsMarkup}
        <div class="redball-actions">
          ${win && !claimed ? '<button type="button" class="btn-primary" id="redball-claim">Claim Reward</button>' : ''}
          <button type="button" class="btn-primary" id="redball-play-again">Play Again</button>
          <button type="button" class="btn-leave-game btn-abandon" id="redball-market">Marketplace</button>
        </div>
      </div>
    `;

    this.container.querySelector('#redball-claim')?.addEventListener('click', () => this.claimReward());
    this.container.querySelector('#redball-play-again')?.addEventListener('click', () => this.playAgain());
    this.container.querySelector('#redball-market')?.addEventListener('click', () => navigateWithFeedback('marketPlace.html'));
    return;

    this.container.innerHTML = `
      <div class="arcade-shell redball-grid">
        ${this.getTopCards()}
        ${win ? '<div class="redball-confetti" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' : ''}
        <div class="redball-panel game-outcome">
          <h3>${win ? 'Table beaten' : 'Run over'}</h3>
          <p>${win ? (claimed ? 'The reward has already been banked to your profile.' : 'You tracked the red ball and earned the win. Claim the reward to finish the run.') : 'The cups got the better of this run, but you can jump straight back in.'}</p>
        </div>
        <div class="redball-panel"><p>Final score: ${this.correctCount}/${this.totalRounds}${this.difficulty === 'normal' ? ` · Ending streak ${this.consecutiveStreak}` : ''}</p></div>
        ${rewardMarkup}
        ${statsMarkup}
        <div class="redball-actions">
          ${win && !claimed ? '<button type="button" class="btn-primary" id="redball-claim">Claim Reward</button>' : ''}
          <button type="button" class="btn-primary" id="redball-play-again">Play Again</button>
          <button type="button" class="btn-leave-game btn-abandon" id="redball-market">Marketplace</button>
        </div>
      </div>
    `;

    this.container.querySelector('#redball-claim')?.addEventListener('click', () => this.claimReward());
    this.container.querySelector('#redball-play-again')?.addEventListener('click', () => this.playAgain());
    this.container.querySelector('#redball-market')?.addEventListener('click', () => navigateWithFeedback('marketPlace.html'));
  }

  async claimReward() {
    if (this.isProcessing || this.gameResult !== 'win' || this.rewardClaimed) return;
    this.isProcessing = true;
    try {
      const res = await fetch('/api/games/shellgame/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSessionId: this.gameSessionId })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) throw new Error(data?.error || 'Failed to claim reward');
      this.rewardClaimed = true;
      this.reward = data.reward || this.reward;
      this.newStats = data.newStats || null;
      this.applyNewStats(data.newStats || {});
      this.clearSessionId();
      showNotification('Reward claimed', 'success');
      this.renderGameOver();
    } catch (err) {
      console.error('Red ball reward claim failed:', err);
      showNotification(err.message || 'Failed to claim reward', 'error');
    } finally {
      this.isProcessing = false;
    }
  }

  applyNewStats(newStats = {}) {
    const cached = getCachedUser() || {};
    const merged = {
      ...cached,
      points: Number(newStats.points ?? cached.points ?? 0),
      xp: Number(newStats.xp ?? cached.xp ?? 0),
      level: newStats.level ?? cached.level,
      bronzeTickets: Number(newStats.bronzeTickets ?? cached.bronzeTickets ?? 0),
      silverTickets: Number(newStats.silverTickets ?? cached.silverTickets ?? 0),
      goldTickets: Number(newStats.goldTickets ?? cached.goldTickets ?? 0)
    };
    setCachedUser(merged);
    updateTopBar(merged);
  }

  async abandonGame(returnToMarket = false) {
    this.clearTimers();
    const sessionId = this.gameSessionId;
    this.clearSessionId();
    this.resetState();

    if (sessionId) {
      try {
        await fetch(`/api/games/shellgame/session/${sessionId}`, { method: 'DELETE', credentials: 'include' });
      } catch (_) {
        // best effort
      }
    }

    if (returnToMarket) return navigateWithFeedback('marketPlace.html');
    await this.loadPassStatus();
    this.renderDifficultySelector();
  }

  async playAgain() {
    this.clearSessionId();
    this.resetState();
    await this.loadPassStatus();
    this.renderDifficultySelector();
  }
}

const game = new RedBallGame();
window.redBallGame = game;

document.addEventListener('DOMContentLoaded', () => {
  game.init();
});
