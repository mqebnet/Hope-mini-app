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
      .redball-page .page-title{margin:12px auto 6px;max-width:360px;color:#f8f2e5;font-size:38px;line-height:1.04;font-family:'Poppins',Arial,sans-serif;font-weight:700;text-align:center}
      .redball-page .arcade-subtitle{max-width:340px;margin:0 auto 18px;color:#c8ddd4;font-size:15px;line-height:1.45;font-family:'Poppins',Arial,sans-serif;text-align:center}
      .redball-shell.arcade-shell{width:min(100%,390px);margin:0 auto 24px;padding:16px;border-radius:26px;border:1px solid rgba(229,217,194,.24);background:
        radial-gradient(circle at top center, rgba(255,255,255,.08), transparent 34%),
        linear-gradient(180deg, rgba(17,31,38,.98), rgba(7,14,18,.99));box-shadow:0 24px 56px rgba(0,0,0,.42)}
      .redball-grid{display:grid;gap:12px;width:100%}
      .redball-panel,.redball-note,.redball-table-card,.redball-stat-card,.redball-rule-card,.redball-feedback,.redball-reward{position:relative;overflow:hidden;padding:14px;border-radius:18px;border:1px solid rgba(231,223,205,.12);background:rgba(255,255,255,.04)}
      .redball-panel:before,.redball-note:before,.redball-table-card:before,.redball-rule-card:before,.redball-feedback:before,.redball-reward:before{content:'';position:absolute;inset:0;background:linear-gradient(135deg, rgba(255,255,255,.08), transparent 42%);pointer-events:none}
      .redball-pass-panel{text-align:center}
      .redball-pass-panel strong,.redball-table-head strong,.redball-outcome-card h3{display:block;color:#fff4dd}
      .redball-pass-panel p,.redball-pass-panel small,.redball-table-head p,.redball-rule-card p,.redball-note p,.redball-panel p,.redball-feedback p{margin:0;color:#c2d5cd}
      .redball-pass-panel-head{display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:4px}
      .redball-pass{display:inline-flex;align-items:center;justify-content:center;padding:0;border:0;background:transparent;color:#f7f3e8;font-size:14px;font-weight:700;letter-spacing:0;text-transform:none}
      .redball-pass-dot{width:9px;height:9px;border-radius:999px;background:#2cf5a1;box-shadow:0 0 14px rgba(44,245,161,.65)}
      .redball-sketch-pass{padding:10px 12px;border-radius:14px !important;border-color:rgba(120,255,210,.24) !important;background:linear-gradient(180deg, rgba(17,44,54,.94), rgba(11,24,30,.98)) !important}
      .redball-sketch-pass small{display:block;margin-top:6px;font-size:11px;color:#a9c5bc}
      .redball-selector-shell.redball-shell.arcade-shell{padding:14px}
      .redball-selector-stage{display:grid;gap:12px}
      .difficulty-selector h3{margin:0;color:#fff4dd;font-size:18px;text-align:center}
      .redball-selector-copy{margin:0;text-align:center;color:#a9c5bc;font-size:13px}
      .difficulty-buttons{display:grid;gap:10px}
      .redball-difficulty-btn{display:grid;justify-items:start;gap:6px;min-height:100px;padding:14px;border-radius:16px;border:1px solid rgba(231,223,205,.12);background:rgba(255,255,255,.04);color:#f8f5ec;text-align:left;transition:transform .2s ease,border-color .2s ease,background .2s ease}
      .redball-difficulty-btn:hover,.redball-difficulty-btn:focus-visible{transform:translateY(-2px);border-color:rgba(255,244,221,.35);background:rgba(255,255,255,.07)}
      .redball-difficulty-index{display:inline-flex;align-items:center;justify-content:center;min-width:34px;padding:5px 8px;border-radius:999px;background:rgba(255,255,255,.08);color:#ffdfa9;font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
      .redball-difficulty-title{display:block;font-size:18px;font-weight:700;color:#fff4dd}
      .redball-difficulty-copy{display:block;font-size:12px;line-height:1.4;color:#bdd2ca}
      .redball-sketch-footer{padding:12px;text-align:center}
      .redball-sketch-footer p{font-size:12px;line-height:1.45;color:#a9c5bc}
      .redball-top{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .redball-stat-card{padding:10px 8px;text-align:center;min-height:70px}
      .redball-stat-card span{display:block;margin-bottom:6px;color:#9cb6ad;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
      .redball-stat-card strong{display:block;color:#fff4dd;font-size:18px;line-height:1.1}
      .redball-table-card{display:grid;gap:14px;background:linear-gradient(180deg, rgba(18,33,40,.95), rgba(9,17,22,.98))}
      .redball-table-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;text-align:left}
      .redball-table-head strong{font-size:17px;line-height:1.2}
      .redball-table-head p{margin-top:6px;font-size:13px;line-height:1.45}
      .redball-badge{display:inline-flex;align-items:center;justify-content:center;min-width:58px;padding:10px 12px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:#fff4dd;font-size:15px;font-weight:800;letter-spacing:.04em}
      .redball-track-wrap{display:flex;justify-content:center}
      .redball-track{position:relative;width:100%;max-width:310px;min-height:194px;padding:24px 16px 54px;border-radius:20px;border:1px solid rgba(231,223,205,.14);background:
        radial-gradient(circle at 50% 24%, rgba(255,255,255,.1), transparent 28%),
        linear-gradient(180deg, rgba(26,45,56,.98), rgba(11,20,26,.99));overflow:hidden}
      .redball-track:after{content:'';position:absolute;left:18px;right:18px;bottom:22px;height:24px;border-radius:999px;background:radial-gradient(circle at center, rgba(255,255,255,.14), rgba(255,255,255,.02) 70%, transparent 75%)}
      .redball-track-rail{position:absolute;left:12%;right:12%;bottom:34px;height:7px;border-radius:999px;background:rgba(255,255,255,.1)}
      .redball-track-light{position:absolute;top:16px;width:62px;height:62px;border-radius:50%;background:radial-gradient(circle, rgba(255,234,188,.22), transparent 66%);filter:blur(2px);pointer-events:none}
      .redball-track-light.left{left:12%}
      .redball-track-light.mid{left:50%;transform:translateX(-50%)}
      .redball-track-light.right{right:12%}
      .redball-cup{position:absolute;left:50%;top:30px;width:76px;padding:0;border:0;background:transparent !important;color:inherit;transform:translateX(calc(-50% + var(--cup-x, 0px)));transition:transform 180ms ease,opacity 180ms ease,filter 180ms ease;cursor:pointer;-webkit-tap-highlight-color:transparent;appearance:none}
      .redball-cup:hover,.redball-cup:active,.redball-cup:focus,.redball-cup:focus-visible{transform:translateX(calc(-50% + var(--cup-x, 0px))) !important;background:transparent !important;box-shadow:none !important;outline:none}
      .redball-cup[disabled]{cursor:not-allowed}
      .redball-cup.is-disabled{opacity:.72}
      .redball-cup.is-picked{filter:drop-shadow(0 0 16px rgba(255,255,255,.16))}
      .redball-cup.is-picked .redball-cup-body{box-shadow:0 0 0 2px rgba(255,255,255,.18),0 18px 28px rgba(255,94,120,.24)}
      .redball-cup.is-correct .redball-cup-body{box-shadow:0 0 0 2px rgba(44,245,161,.48),0 18px 28px rgba(44,245,161,.2)}
      .redball-cup.is-wrong .redball-cup-body{box-shadow:0 0 0 2px rgba(255,117,117,.44),0 18px 28px rgba(255,117,117,.2)}
      .redball-cup-body{position:relative;width:100%;height:102px;border-radius:14px 14px 32px 32px;background:linear-gradient(180deg, #ebd8b4, #915733);box-shadow:0 18px 24px rgba(0,0,0,.28)}
      .redball-cup-body:before{content:'';position:absolute;top:-8px;left:50%;width:26px;height:15px;border-radius:999px;transform:translateX(-50%);background:#c88d5f}
      .redball-cup-shadow{position:absolute;left:50%;bottom:24px;width:64px;height:14px;border-radius:50%;transform:translateX(-50%);background:rgba(0,0,0,.22);filter:blur(4px)}
      .redball-cup-label{display:block;margin-top:8px;text-align:center;color:#d7ebe4;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
      .redball-ball{position:absolute;left:50%;bottom:-12px;width:24px;height:24px;border-radius:50%;background:radial-gradient(circle at 30% 28%, rgba(255,255,255,.95), rgba(255,255,255,.1) 26%), linear-gradient(145deg,#ff6d89,#b91133);transform:translateX(-50%);opacity:0;transition:opacity 160ms ease}
      .redball-cup.is-ball .redball-ball{opacity:1}
      .redball-table-foot{display:grid;gap:10px}
      .redball-progress{display:grid;gap:6px;padding:10px 12px;border-radius:14px;border:1px solid rgba(231,223,205,.12);background:rgba(255,255,255,.03)}
      .redball-progress-head{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#d7ebe4;font-size:12px}
      .redball-progress-bar{height:10px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}
      .redball-progress-fill{height:100%;background:linear-gradient(90deg, #ffd37d, #ff9c73, #ff5b6f);transform-origin:left center}
      .redball-rule-card span{display:block;margin-bottom:8px;color:#9cb6ad;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
      .redball-actions{display:grid;gap:10px}
      .redball-actions > *{width:100%;margin:0 !important}
      .redball-round-secondary{width:100%;margin:0 !important}
      .redball-feedback{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .redball-feedback strong{display:block;margin-bottom:4px;color:#fff4dd;font-size:15px}
      .redball-reward{display:flex;align-items:center;justify-content:space-between;gap:12px;color:#eff9f4}
      .redball-reward span:last-child{font-weight:800;color:#fff4dd}
      .redball-outcome-card{text-align:center}
      .redball-outcome-card h3{margin:0 0 8px;font-size:28px}
      .redball-outcome-card p{margin:0}
      .redball-confetti{display:flex;justify-content:center;gap:10px;min-height:14px}
      .redball-confetti span{width:8px;height:18px;border-radius:999px;animation:redball-drop 1.1s ease-in-out infinite}
      .redball-confetti span:nth-child(1){background:#ff7188}
      .redball-confetti span:nth-child(2){background:#ffd15b;animation-delay:.1s}
      .redball-confetti span:nth-child(3){background:#00ffaa;animation-delay:.2s}
      .redball-confetti span:nth-child(4){background:#69d3ff;animation-delay:.3s}
      .redball-confetti span:nth-child(5){background:#fff27a;animation-delay:.4s}
      @keyframes redball-drop{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(18px) rotate(90deg);opacity:0}}
      @media (min-width:521px){
        .difficulty-buttons{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
      @media (max-width:420px){
        .redball-page .page-title{font-size:33px}
        .redball-page .arcade-subtitle{font-size:14px}
        .redball-shell.arcade-shell{padding:14px;border-radius:22px}
        .redball-track{min-height:180px;padding:22px 12px 52px}
        .redball-cup{width:66px}
        .redball-cup-body{height:92px}
        .redball-stat-card strong{font-size:16px}
        .redball-badge{min-width:52px;padding:9px 10px}
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
      <button class="difficulty-btn redball-difficulty-btn" data-difficulty="easy">
        <span class="redball-difficulty-index">01</span>
        <span class="redball-difficulty-title">${t('shellgame.easy_label', 'Easy')}</span>
        <span class="redball-difficulty-copy">${t('shellgame.easy_goal', 'Find the red ball at least 3 times in 5 rounds.')}</span>
      </button>
      <button class="difficulty-btn redball-difficulty-btn" data-difficulty="normal">
        <span class="redball-difficulty-index">02</span>
        <span class="redball-difficulty-title">${t('shellgame.normal_label', 'Normal')}</span>
        <span class="redball-difficulty-copy">${t('shellgame.normal_goal', 'Find the red ball 3 times in a row.')}</span>
      </button>
      <button class="difficulty-btn redball-difficulty-btn" data-difficulty="hard">
        <span class="redball-difficulty-index">03</span>
        <span class="redball-difficulty-title">${t('shellgame.hard_label', 'Hard')}</span>
        <span class="redball-difficulty-copy">${t('shellgame.hard_goal', 'Go 5 for 5. One wrong cup means game over.')}</span>
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
    const passMarkup = this.getPassMarkup();

    this.container.innerHTML = `
      <div class="arcade-shell redball-shell redball-selector-shell redball-grid">
        ${passMarkup}
        <div class="redball-panel redball-selector-stage difficulty-selector">
          <h3>${t('shellgame.select_difficulty', 'Choose Difficulty')}</h3>
          <p class="redball-selector-copy">Pick the table you want to play.</p>
          <div class="difficulty-buttons">${this.getDifficultyCardsMarkup()}</div>
          <button type="button" class="btn-back-games arcade-entry-back" id="redball-back-market">${t('back_to_market', 'Back to Marketplace')}</button>
        </div>
        <div class="redball-note redball-sketch-footer"><p>${t('shellgame.rules_copy', 'The server keeps the answer hidden. You only see the opening reveal and shuffle sequence.')}</p></div>
      </div>
    `;

    this.container.querySelectorAll('[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => this.startGame(button.dataset.difficulty));
    });
    this.container.querySelector('#redball-buy-pass')?.addEventListener('click', () => navigateWithFeedback('gamepass.html?game=shellgame'));
    this.container.querySelector('#redball-back-market')?.addEventListener('click', () => navigateWithFeedback('marketPlace.html'));
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
        ${this.getTopCards()}
        <div class="redball-table-card">
          <div class="redball-table-head">
            <div><strong id="redball-title">Track the red ball</strong><p id="redball-copy">Start the round, watch the reveal, then follow the shuffle.</p></div>
            <div class="redball-badge" id="redball-badge">Wait</div>
          </div>
          ${this.renderTrack()}
          <div class="redball-table-foot">
            <div class="redball-progress">
              <div class="redball-progress-head"><span>Decision window</span><span id="redball-timer">${formatTimer(this.decisionTimerSeconds)}</span></div>
              <div class="redball-progress-bar"><div class="redball-progress-fill" id="redball-fill"></div></div>
            </div>
            <button type="button" class="btn-primary" id="redball-start-round">Start</button>
          </div>
        </div>
        <div class="redball-rule-card"><span>Win rule</span><p>${this.getModeRule()}</p></div>
        <button type="button" class="btn-leave-game btn-abandon redball-round-secondary" id="redball-leave">Leave Game</button>
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
        startButton.textContent = 'Start';
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
        ${this.getTopCards()}
        <div class="redball-table-card">
          <div class="redball-table-head">
            <div><strong id="redball-title">${title}</strong><p id="redball-copy">${copy}</p></div>
            <div class="redball-badge" id="redball-badge">${this.lastRoundResult?.correct ? 'OK' : timedOut ? '00' : 'NO'}</div>
          </div>
          ${this.renderTrack()}
          <div class="redball-table-foot">
            <button type="button" class="btn-primary" id="redball-next">Next Round</button>
          </div>
        </div>
        <div class="redball-rule-card"><span>Progress</span><p>${this.correctCount}/${this.totalRounds} correct${this.difficulty === 'normal' ? ` / Streak ${this.consecutiveStreak}` : ''}</p></div>
        <button type="button" class="btn-leave-game btn-abandon redball-round-secondary" id="redball-leave-result">Leave Game</button>
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
      { label: `⭐ ${t('flipcards.points_label', 'Points')}`, value: Number(reward.points || 0) },
      { label: `⚡ ${t('flipcards.xp_label', 'XP')}`, value: Number(reward.xp || 0) }
    ];
    if (Number(reward.bronzeTickets || 0)) items.push({ label: `🎫 ${t('flipcards.bronze_tickets', 'Bronze Tickets')}`, value: Number(reward.bronzeTickets || 0) });
    if (Number(reward.silverTickets || 0)) items.push({ label: `🥈 ${t('flipcards.silver_tickets', 'Silver Tickets')}`, value: Number(reward.silverTickets || 0) });
    if (Number(reward.goldTickets || 0)) items.push({ label: `🥇 ${t('flipcards.gold_tickets', 'Gold Tickets')}`, value: Number(reward.goldTickets || 0) });
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
        ${this.getTopCards()}
        ${win ? '<div class="redball-confetti" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>' : ''}
        <div class="redball-panel redball-outcome-card game-outcome">
          <h3>${win ? 'Table beaten' : 'Run over'}</h3>
          <p>${win ? (claimed ? 'Reward claimed!' : 'You won! Claim your reward.') : 'Try again whenever ready.'}</p>
        </div>
        <div class="redball-rule-card"><span>Final</span><p>${this.correctCount}/${this.totalRounds} correct${this.difficulty === 'normal' ? ` / Streak ${this.consecutiveStreak}` : ''}</p></div>
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
