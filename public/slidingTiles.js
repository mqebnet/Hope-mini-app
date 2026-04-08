import { updateTopBar, getCachedUser, setCachedUser, fetchUserData } from './userData.js';
import { i18n } from './i18n.js';
import { navigateWithFeedback } from './utils.js';

function t(key, fallback) {
  const value = i18n.t(key);
  return value && value !== key ? value : fallback;
}

function showNotification(message, type = 'info') {
  if (type === 'success' && typeof window.showSuccessToast === 'function') {
    window.showSuccessToast(message);
    return;
  }
  if (type === 'error' && typeof window.showErrorToast === 'function') {
    window.showErrorToast(message);
    return;
  }
  if (type === 'warn' && typeof window.showWarningToast === 'function') {
    window.showWarningToast(message);
    return;
  }
  alert(message);
}

class SlidingTilesGame {
  constructor() {
    this.gameSessionId = null;
    this.board = [];
    this.size = 4;
    this.timeLimit = 0;
    this.timeRemaining = 0;
    this.timerInterval = null;
    this.startTime = null;
    this.difficulty = 'normal';
    this.isGameActive = false;
    this.isProcessing = false;
    this.moveCount = 0;
    this.mistakes = 0;
    this.container = document.getElementById('slidingtiles-game');
  }

  async init() {
    const cached = getCachedUser();
    if (cached) updateTopBar(cached);

    try {
      const user = await fetchUserData();
      updateTopBar(user);
    } catch (err) {
      console.warn('Sliding Tiles user bootstrap failed:', err);
    }

    this.renderDifficultySelector();
  }

  renderDifficultySelector() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="difficulty-selector arcade-shell">
        <h3>${t('slidingtiles.select_difficulty', 'Choose your grid')}</h3>
        <div class="difficulty-buttons">
          <button class="difficulty-btn" data-difficulty="easy">
            <span class="icon">3x3</span>
            <span>${t('slidingtiles.easy_label', 'Easy')}</span>
            <small>${t('slidingtiles.easy_meta', '75s • fast warm-up')}</small>
          </button>
          <button class="difficulty-btn" data-difficulty="normal">
            <span class="icon">4x4</span>
            <span>${t('slidingtiles.normal_label', 'Normal')}</span>
            <small>${t('slidingtiles.normal_meta', '110s • deeper scramble')}</small>
          </button>
          <button class="difficulty-btn" data-difficulty="hard">
            <span class="icon">5x5</span>
            <span>${t('slidingtiles.hard_label', 'Hard')}</span>
            <small>${t('slidingtiles.hard_meta', '150s • full grid pressure')}</small>
          </button>
        </div>
        <p class="flipcards-instructions">${t('slidingtiles.instructions', 'Slide numbered tiles into order with the empty slot in the bottom-right corner.')}</p>
      </div>
    `;

    this.container.querySelectorAll('[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => this.startGame(button.dataset.difficulty));
    });
  }

  async startGame(difficulty = 'normal') {
    try {
      const response = await fetch('/api/games/slidingtiles/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty })
      });
      const data = await response.json();

      if (response.status === 402) {
        navigateWithFeedback('gamepass.html?game=slidingtiles');
        return;
      }
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || t('slidingtiles.failed_start', 'Failed to start game'));
      }

      this.gameSessionId = data.gameSessionId;
      this.board = Array.isArray(data.board) ? data.board : [];
      this.size = Number(data.size || 4);
      this.timeLimit = Number(data.timeLimit || 60);
      this.timeRemaining = this.timeLimit;
      this.startTime = Date.now();
      this.difficulty = difficulty;
      this.isGameActive = true;
      this.isProcessing = false;
      this.moveCount = Number(data.moveCount || 0);
      this.mistakes = 0;

      this.renderGame();
      this.startTimer();
    } catch (err) {
      console.error('Sliding Tiles start failed:', err);
      showNotification(err.message || t('slidingtiles.failed_start', 'Failed to start game'), 'error');
    }
  }

  renderGame() {
    if (!this.container) return;

    const boardHtml = this.board.map((value, index) => {
      if (value === 0) {
        return `<div class="slidingtile slidingtile-empty" data-index="${index}" aria-hidden="true"></div>`;
      }
      return `
        <button class="slidingtile" data-index="${index}">
          <span>${value}</span>
        </button>
      `;
    }).join('');

    this.container.innerHTML = `
      <div class="arcade-shell">
        <div class="arcade-header arcade-header-sticky">
          <div class="arcade-chip">
            <span>${t('slidingtiles.timer_label', 'Time')}</span>
            <strong id="slidingtiles-timer">${this.timeRemaining}s</strong>
          </div>
          <div class="arcade-chip">
            <span>${t('slidingtiles.moves_label', 'Moves')}</span>
            <strong id="slidingtiles-moves">${this.moveCount}</strong>
          </div>
          <div class="arcade-chip">
            <span>${t('slidingtiles.goal_label', 'Goal')}</span>
            <strong>${this.size}x${this.size}</strong>
          </div>
        </div>

        <div class="slidingtiles-board" style="--grid-size:${this.size}">
          ${boardHtml}
        </div>

        <p class="flipcards-instructions">${t('slidingtiles.instructions', 'Slide numbered tiles into order with the empty slot in the bottom-right corner.')}</p>
        <button id="slidingtiles-abandon" class="btn-leave-game btn-abandon">${t('slidingtiles.leave_game', 'Leave Game')}</button>
      </div>
    `;

    this.container.querySelectorAll('.slidingtile[data-index]').forEach((button) => {
      button.addEventListener('click', () => this.handleTileMove(Number(button.dataset.index)));
    });

    this.container.querySelector('#slidingtiles-abandon')?.addEventListener('click', () => this.abandonGame(true));
  }

  updateStats() {
    const timerEl = document.getElementById('slidingtiles-timer');
    const movesEl = document.getElementById('slidingtiles-moves');
    if (timerEl) timerEl.textContent = `${this.timeRemaining}s`;
    if (movesEl) movesEl.textContent = String(this.moveCount);
  }

  startTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isGameActive) return;

      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.timeRemaining = Math.max(0, this.timeLimit - elapsed);
      this.updateStats();

      if (this.timeRemaining <= 0) {
        this.handleTimeExpired();
      }
    }, 250);
  }

  async handleTileMove(tileIndex) {
    if (!this.isGameActive || this.isProcessing) return;

    this.isProcessing = true;
    try {
      const response = await fetch('/api/games/slidingtiles/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameSessionId: this.gameSessionId,
          tileIndex
        })
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || t('slidingtiles.move_failed', 'Move failed'));
      }

      this.board = Array.isArray(data.board) ? data.board : this.board;
      this.moveCount = Number(data.moveCount || this.moveCount);
      this.mistakes = Number(data.mistakes || this.mistakes);
      this.renderGame();
      this.updateStats();

      if (data.gameComplete) {
        await this.finishGame();
      }
    } catch (err) {
      console.error('Sliding Tiles move failed:', err);
      showNotification(err.message || t('slidingtiles.move_failed', 'Move failed'), 'error');
    } finally {
      this.isProcessing = false;
    }
  }

  async finishGame() {
    if (!this.isGameActive) return;

    this.isGameActive = false;
    clearInterval(this.timerInterval);

    try {
      const response = await fetch('/api/games/slidingtiles/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSessionId: this.gameSessionId })
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || t('slidingtiles.failed_claim_reward', 'Failed to claim reward'));
      }

      this.applyNewStats(data.newStats);
      this.showRewardModal(data.reward, data.stats, data.newStats);
    } catch (err) {
      console.error('Sliding Tiles reward claim failed:', err);
      showNotification(err.message || t('slidingtiles.failed_claim_reward', 'Failed to claim reward'), 'error');
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

  showRewardModal(reward = {}, stats = {}, newStats = {}) {
    window.hopeTriggerHaptic?.('success');
    const modal = document.createElement('div');
    modal.className = 'reward-modal';
    modal.innerHTML = `
      <div class="reward-content">
        <h2>${t('slidingtiles.complete_title', 'Grid Restored!')}</h2>
        <p>${t('slidingtiles.complete_subtitle', 'You solved the scramble and banked the rewards.')}</p>

        <div class="game-stats">
          <div class="stat">
            <span class="stat-label">${t('slidingtiles.moves_label', 'Moves')}</span>
            <span class="stat-value">${Number(stats.moves || 0)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">${t('slidingtiles.timer_label', 'Time')}</span>
            <span class="stat-value">${Number(stats.time || 0)}s</span>
          </div>
        </div>

        <div class="rewards-earned">
          <h3>${t('slidingtiles.rewards_earned', 'Rewards Earned')}</h3>
          <div class="reward-item"><span>${t('flipcards.points_label', 'Points')}</span><span class="reward-amount">+${Number(reward.points || 0)}</span></div>
          <div class="reward-item"><span>${t('flipcards.xp_label', 'XP')}</span><span class="reward-amount">+${Number(reward.xp || 0)}</span></div>
          ${Number(reward.bronzeTickets || 0) ? `<div class="reward-item"><span>${t('flipcards.bronze_tickets', 'Bronze Tickets')}</span><span class="reward-amount">+${Number(reward.bronzeTickets || 0)}</span></div>` : ''}
          ${Number(reward.silverTickets || 0) ? `<div class="reward-item"><span>${t('flipcards.silver_tickets', 'Silver Tickets')}</span><span class="reward-amount">+${Number(reward.silverTickets || 0)}</span></div>` : ''}
        </div>

        <div class="new-stats">
          <p>${t('flipcards.total_points', 'Total Points:')} ${Number(newStats.points || 0)}</p>
          <p>${t('flipcards.level_label', 'Level:')} ${newStats.level || '-'}</p>
        </div>

        <button class="btn-primary" id="slidingtiles-replay">${t('slidingtiles.play_again', 'Play Again')}</button>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#slidingtiles-replay')?.addEventListener('click', () => {
      modal.remove();
      this.renderDifficultySelector();
    });
  }

  handleTimeExpired() {
    if (!this.isGameActive) return;
    window.hopeTriggerHaptic?.('error');

    this.isGameActive = false;
    clearInterval(this.timerInterval);
    this.abandonGame(false);

    this.container.innerHTML = `
      <div class="arcade-shell game-outcome">
        <h3>${t('slidingtiles.time_up', "Time's up")}</h3>
        <p>${t('slidingtiles.time_up_desc', 'The neon grid locked before you could finish it.')}</p>
        <button id="slidingtiles-retry" class="btn-primary">${t('slidingtiles.try_again', 'Try Again')}</button>
      </div>
    `;
    this.container.querySelector('#slidingtiles-retry')?.addEventListener('click', () => this.renderDifficultySelector());
  }

  async abandonGame(returnToMarket = false) {
    clearInterval(this.timerInterval);
    const sessionId = this.gameSessionId;
    this.gameSessionId = null;
    this.isGameActive = false;

    if (sessionId) {
      try {
        await fetch(`/api/games/slidingtiles/session/${sessionId}`, {
          method: 'DELETE',
          credentials: 'include'
        });
      } catch (_) {
        // best effort
      }
    }

    if (returnToMarket) {
      navigateWithFeedback('marketPlace.html');
    }
  }
}

const game = new SlidingTilesGame();
window.slidingTilesGame = game;

document.addEventListener('DOMContentLoaded', () => {
  game.init();
});
