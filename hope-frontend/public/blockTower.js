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

class BlockTowerGame {
  constructor() {
    this.container = document.getElementById('blocktower-game');
    this.userSnapshot = getCachedUser() || null;
    this.gameSessionId = null;
    this.palette = [];
    this.targetStack = [];
    this.builtStack = [];
    this.inventory = {};
    this.availableCounts = {};
    this.timeLimit = 0;
    this.timeRemaining = 0;
    this.previewSeconds = 0;
    this.previewDeadline = 0;
    this.difficulty = 'normal';
    this.timerInterval = null;
    this.startTime = null;
    this.isProcessing = false;
    this.isGameActive = false;
    this.moveCount = 0;
    this.mistakes = 0;
    this.previewAnimationFrame = null;
    this.buildPhaseBound = false;
    this.handleBuildClick = this.handleBuildClick.bind(this);
    this.hasActivePass = false;
    this.passValidUntil = null;
    this.hint = {
      enabled: false,
      used: 0,
      maxUses: 0,
      remainingUses: 0,
      nextCostBronze: 0,
      nextCostPoints: 0,
      revealSeconds: 10
    };
    this.hintOverlayVisible = false;
    this.hintOverlayStack = [];
    this.hintHideTimer = null;
  }

  async init() {
    const cached = getCachedUser();
    if (cached) {
      this.userSnapshot = cached;
      updateTopBar(cached);
    }

    try {
      const user = await fetchUserData();
      this.userSnapshot = user;
      updateTopBar(user);
    } catch (err) {
      console.warn('Block Tower user bootstrap failed:', err);
    }

    await this.loadPassStatus();
    this.renderDifficultySelector();
  }

  async loadPassStatus() {
    try {
      const response = await fetch('/api/games/blocktower/status', { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (response.ok) {
        this.hasActivePass = Boolean(data?.hasActivePass);
        this.passValidUntil = data?.passValidUntil || null;
      }
    } catch (_) {
      this.hasActivePass = false;
      this.passValidUntil = null;
    }
  }

  getPassActiveMarkup() {
    if (!this.hasActivePass) return '';
    return `
      <div class="arcade-pass-banner">
        <div class="arcade-pass-banner-head">Pass Active <span class="arcade-pass-banner-dot" aria-hidden="true"></span></div>
        <small class="arcade-pass-banner-copy">${this.passValidUntil ? `until ${new Date(this.passValidUntil).toLocaleString()}` : 'Pass is active now.'}</small>
      </div>
    `;
  }

  renderDifficultySelector() {
    if (!this.container) return;
    this.clearHintOverlay();

    this.container.innerHTML = `
      <div class="difficulty-selector arcade-shell">
        ${this.getPassActiveMarkup()}
        <h3>${t('blocktower.select_difficulty', 'Choose your tower run')}</h3>
        <div class="difficulty-buttons">
          <button class="difficulty-btn" data-difficulty="easy">
            <span class="icon">6</span>
            <span>${t('blocktower.easy_label', 'Easy')}</span>
            <small>${t('blocktower.easy_meta', '60s • 6 blocks')}</small>
          </button>
          <button class="difficulty-btn" data-difficulty="normal">
            <span class="icon">10</span>
            <span>${t('blocktower.normal_label', 'Normal')}</span>
            <small>${t('blocktower.normal_meta', '60s • 10 blocks')}</small>
          </button>
          <button class="difficulty-btn" data-difficulty="hard">
            <span class="icon">12</span>
            <span>${t('blocktower.hard_label', 'Hard')}</span>
            <small>${t('blocktower.hard_meta', '30s • 12 blocks')}</small>
          </button>
        </div>
        <p class="flipcards-instructions">${t('blocktower.instructions', 'Memorize the color order, then rebuild the tower from bottom to top before time runs out.')}</p>
        <button type="button" class="btn-back-games arcade-entry-back" id="blocktower-back-market">${t('back_to_market', 'Back to Marketplace')}</button>
      </div>
    `;

    this.container.querySelectorAll('[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => this.startGame(button.dataset.difficulty));
    });
    this.container.querySelector('#blocktower-back-market')?.addEventListener('click', () => navigateWithFeedback('marketPlace.html'));
  }

  async startGame(difficulty = 'normal') {
    try {
      this.clearHintOverlay();
      const response = await fetch('/api/games/blocktower/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty })
      });
      const data = await response.json();

      if (response.status === 402) {
        navigateWithFeedback('gamepass.html?game=blocktower');
        return;
      }
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || t('blocktower.failed_start', 'Failed to start game'));
      }

      this.gameSessionId = data.gameSessionId;
      this.palette = Array.isArray(data.palette) ? data.palette : [];
      this.targetStack = Array.isArray(data.targetStack) ? data.targetStack : [];
      this.inventory = data.inventory || {};
      this.availableCounts = data.availableCounts || {};
      this.builtStack = [];
      this.timeLimit = Number(data.timeLimit || 60);
      this.previewSeconds = Number(data.previewSeconds || 6);
      this.previewDeadline = Date.now() + this.previewSeconds * 1000;
      this.difficulty = difficulty;
      this.moveCount = 0;
      this.mistakes = 0;
      this.isGameActive = true;
      this.syncState(data);

      this.renderPreviewPhase();
      this.startPreviewCountdown();
      this.animatePreviewStack();
    } catch (err) {
      console.error('Block Tower start failed:', err);
      showNotification(err.message || t('blocktower.failed_start', 'Failed to start game'), 'error');
    }
  }

  getColorMeta(colorId) {
    return this.palette.find((entry) => entry.id === colorId) || {
      id: colorId,
      label: colorId,
      short: String(colorId || '?').slice(0, 1).toUpperCase(),
      hex: '#00ffaa'
    };
  }

  renderPreviewPhase() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="arcade-shell blocktower-shell blocktower-game-shell">
        <div class="blocktower-topbar">
          <div class="blocktower-mini-stat">
            <span>${t('blocktower.preview_label', 'Memorize')}</span>
            <strong id="blocktower-preview-timer">${Math.max(0, Math.ceil((this.previewDeadline - Date.now()) / 1000))}s</strong>
          </div>
          <div class="blocktower-mini-stat">
            <span>${t('blocktower.blocks_label', 'Blocks')}</span>
            <strong>${this.targetStack.length}</strong>
          </div>
        </div>

        <div class="blocktower-stage">
          <section class="blocktower-panel blocktower-panel-solution">
            <div class="blocktower-panel-head">
              <h3>${t('blocktower.solution_panel', 'Memorize Stack')}</h3>
              <span>${t('blocktower.bottom_to_top', 'Bottom to Top')}</span>
            </div>
            <div class="blocktower-stack-lane">
              <div id="blocktower-preview-stack" class="blocktower-stack"></div>
            </div>
          </section>

          <section class="blocktower-panel blocktower-panel-tray is-disabled">
            <div class="blocktower-panel-head">
              <h3>${t('blocktower.tray_panel', 'Blocks Tray')}</h3>
              <span>${t('blocktower.wait_for_build', 'Unlocks after preview')}</span>
            </div>
            <div class="blocktower-tray-grid">
              ${this.renderTrayButtons(true)}
            </div>
          </section>
        </div>

        <div class="blocktower-footer-note">
          <strong>${t('blocktower.preview_hint_label', 'Hint')}</strong>
          <span>${t('blocktower.preview_desc', 'Watch the bricks fall into place, memorize the order, then rebuild it before time runs out.')}</span>
        </div>
      </div>
    `;
  }

  renderBuildPhase() {
    if (!this.container) return;

    if (!this.container.querySelector('[data-blocktower-phase="build"]')) {
      this.container.innerHTML = `
        <div class="arcade-shell blocktower-shell blocktower-game-shell" data-blocktower-phase="build">
          <div class="blocktower-topbar">
            <div class="blocktower-mini-stat">
              <span>${t('blocktower.timer_label', 'Time')}</span>
              <strong id="blocktower-timer">${this.timeRemaining}s</strong>
            </div>
            <div class="blocktower-mini-stat">
              <span>${t('blocktower.progress_label', 'Placed')}</span>
              <strong id="blocktower-progress">${this.builtStack.length}/${this.targetStack.length}</strong>
            </div>
            <div class="blocktower-mini-stat">
              <span>${t('blocktower.strikes_label', 'Misses')}</span>
              <strong id="blocktower-strikes">${this.mistakes}</strong>
            </div>
          </div>

          ${this.renderHintControls()}

          <div class="blocktower-stage">
            <section class="blocktower-panel blocktower-panel-solution">
              <div class="blocktower-panel-head">
                <h3>${t('blocktower.solution_panel', 'Build Stack')}</h3>
                <span>${t('blocktower.tap_top_to_remove', 'Tap top block to remove')}</span>
              </div>
              <div class="blocktower-stack-lane">
                <div id="blocktower-built-stack" class="blocktower-stack is-live"></div>
              </div>
            </section>

            <section class="blocktower-panel blocktower-panel-tray">
              <div class="blocktower-panel-head">
                <h3>${t('blocktower.tray_panel', 'Blocks Tray')}</h3>
                <span>${t('blocktower.tap_to_stack', 'Tap a block to stack')}</span>
              </div>
              <div id="blocktower-tray-grid" class="blocktower-tray-grid"></div>
            </section>
          </div>

          <div class="blocktower-footer-note">
            <strong>${t('blocktower.build_hint_label', 'Hint')}</strong>
            <span>${t('blocktower.build_hint', 'If the full tower is wrong, remove blocks from the top only and rebuild before time runs out.')}</span>
          </div>

          <button id="blocktower-abandon" class="btn-leave-game btn-abandon">${t('blocktower.leave_game', 'Leave Game')}</button>
        </div>
      `;
    }

    const builtStackEl = this.container.querySelector('#blocktower-built-stack');
    const trayGridEl = this.container.querySelector('#blocktower-tray-grid');
    const helperHost = this.container.querySelector('#blocktower-helper-strip');
    if (builtStackEl) builtStackEl.innerHTML = this.renderBuiltStack();
    if (trayGridEl) trayGridEl.innerHTML = this.renderTrayButtons(false);
    if (helperHost) {
      helperHost.className = `blocktower-helper-strip${this.hintOverlayVisible ? ' is-revealing' : ''}`;
      helperHost.innerHTML = this.renderHintControlContent();
    }
    this.refreshStats();
    this.bindBuildEvents();
  }

  canUseHintFeature() {
    return this.difficulty === 'normal' || this.difficulty === 'hard';
  }

  getBronzeBalance() {
    if (this.userSnapshot && this.userSnapshot.bronzeTickets != null) {
      return Number(this.userSnapshot.bronzeTickets);
    }

    const cached = getCachedUser();
    if (cached && cached.bronzeTickets != null) {
      this.userSnapshot = cached;
      return Number(cached.bronzeTickets);
    }

    return null;
  }

  getPointsBalance() {
    if (this.userSnapshot && this.userSnapshot.points != null) {
      return Number(this.userSnapshot.points);
    }

    const cached = getCachedUser();
    if (cached && cached.points != null) {
      this.userSnapshot = cached;
      return Number(cached.points);
    }

    return null;
  }

  getHintUiState() {
    const enabled = this.canUseHintFeature() && Boolean(this.hint?.enabled);
    const nextBronzeCost = Number(this.hint?.nextCostBronze || 0);
    const nextPointsCost = Number(this.hint?.nextCostPoints || 0);
    const remainingUses = Number(this.hint?.remainingUses || 0);
    const bronzeBalance = this.getBronzeBalance();
    const pointsBalance = this.getPointsBalance();
    const hasEnoughBronze = bronzeBalance == null ? true : (nextBronzeCost > 0 ? bronzeBalance >= nextBronzeCost : true);
    const hasEnoughPoints = pointsBalance == null ? true : (nextPointsCost > 0 ? pointsBalance >= nextPointsCost : true);
    const costSummary = nextPointsCost > 0
      ? `${nextBronzeCost} Bronze tickets + ${nextPointsCost} Points`
      : `${nextBronzeCost} Bronze tickets`;

    let disabled = this.isProcessing || !this.isGameActive || this.hintOverlayVisible;
    let copy = t('blocktower.help_ready_copy', `This will cost ${costSummary}`);

    if (!enabled) {
      disabled = true;
      copy = t('blocktower.help_ready_copy', `This will cost ${costSummary}`);
    } else if (remainingUses <= 0) {
      disabled = true;
      copy = t('blocktower.help_spent_copy', 'You have used both help charges for this run.');
    } else if (!hasEnoughBronze || !hasEnoughPoints) {
      disabled = true;
      copy = t('blocktower.help_low_balance_copy', `Need ${costSummary} for the next help.`);
    } else if (this.hintOverlayVisible) {
      disabled = true;
      copy = t('blocktower.help_showing_copy', 'Solved stack is visible right now.');
    }

    return {
      enabled,
      disabled,
      nextBronzeCost,
      nextPointsCost,
      remainingUses,
      bronzeBalance,
      pointsBalance,
      costSummary,
      copy
    };
  }

  renderHintControls() {
    if (!this.canUseHintFeature()) return '';
    return `
      <div id="blocktower-helper-strip" class="blocktower-helper-strip${this.hintOverlayVisible ? ' is-revealing' : ''}">
        ${this.renderHintControlContent()}
      </div>
    `;
  }

  renderHintControlContent() {
    const state = this.getHintUiState();
    const used = Number(this.hint?.used || 0);
    const maxUses = Number(this.hint?.maxUses || 0);
    const buttonLabel = state.nextBronzeCost > 0
      ? t('blocktower.help_button', `Help - ${state.costSummary}`)
      : t('blocktower.help_button_spent', 'Help');
    const metaLabel = state.remainingUses > 0 && state.nextBronzeCost > 0
      ? t('blocktower.help_meta', `Next: ${state.costSummary} - ${used}/${maxUses || 2} used`)
      : t('blocktower.help_meta_spent', `${used}/${maxUses || 2} used - 0 left`);
    const previewMarkup = this.hintOverlayVisible && this.hintOverlayStack.length
      ? this.renderHintPreviewPanel()
      : '';

    return `
      <div class="blocktower-helper-main">
        <div class="blocktower-helper-copy">
          <strong>${t('blocktower.help_title', 'Help')}</strong>
          <span>${state.copy}</span>
        </div>
        <div class="blocktower-helper-actions">
          <div class="blocktower-helper-meta">${metaLabel}</div>
          <button
            type="button"
            id="blocktower-hint-button"
            class="blocktower-helper-btn${state.disabled ? ' is-disabled' : ''}"
            ${state.disabled ? 'disabled' : ''}
          >${buttonLabel}</button>
        </div>
      </div>
      ${previewMarkup}
    `;
  }

  renderHintPreviewPanel() {
    if (!this.hintOverlayVisible || !this.hintOverlayStack.length) return '';

    return `
      <div class="blocktower-helper-preview">
        <div class="blocktower-helper-preview-head">
          <strong>${t('blocktower.hint_overlay_title', 'Solved')}</strong>
          <span>${t('blocktower.hint_overlay_timer', '10s')}</span>
        </div>
        <div class="blocktower-helper-preview-stack">
          ${this.hintOverlayStack.map((colorId) => {
            const color = this.getColorMeta(colorId);
            return `
              <div
                class="blocktower-helper-preview-block"
                style="--tower-color:${color.hex}"
                aria-label="${color.label}"
                title="${color.label}"
              ></div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  showHintOverlay(targetStack = [], durationSeconds = 10) {
    this.clearHintOverlay(false);
    this.hintOverlayVisible = true;
    this.hintOverlayStack = Array.isArray(targetStack) ? [...targetStack] : [];
    this.renderBuildPhase();
    this.hintHideTimer = window.setTimeout(() => {
      this.clearHintOverlay();
    }, Math.max(1, Number(durationSeconds || 10)) * 1000);
  }

  clearHintOverlay(shouldRender = true) {
    clearTimeout(this.hintHideTimer);
    this.hintHideTimer = null;
    this.hintOverlayVisible = false;
    this.hintOverlayStack = [];
    if (shouldRender && this.container?.querySelector('[data-blocktower-phase="build"]')) {
      this.renderBuildPhase();
    }
  }

  renderTrayButtons(disabled = false) {
    return this.palette.map((color) => {
      const total = Number(this.inventory[color.id] || 0);
      const available = Number(this.availableCounts[color.id] || 0);
      const isEmpty = available <= 0;
      return `
        <button
          class="blocktower-brick blocktower-tray-brick${isEmpty ? ' is-empty' : ''}"
          data-color-id="${color.id}"
          style="--tower-color:${color.hex}"
          ${disabled || isEmpty ? 'disabled' : ''}
        >
          <span class="brick-label">${color.label}</span>
          <span class="brick-count">${available}/${total}</span>
        </button>
      `;
    }).join('');
  }

  renderBuiltStack() {
    if (!this.builtStack.length) {
      return `<div class="tower-block tower-block-placeholder"><span>${t('blocktower.stack_here', 'Stack here')}</span></div>`;
    }

    return this.builtStack.map((colorId, index) => {
      const color = this.getColorMeta(colorId);
      const isTop = index === this.builtStack.length - 1;
      return `
        <button
          class="tower-block${isTop ? ' is-top' : ''}"
          style="--tower-color:${color.hex}"
          data-remove-index="${index}"
          ${isTop ? '' : 'disabled'}
        >
          <span>${color.label}</span>
        </button>
      `;
    }).join('');
  }

  animatePreviewStack() {
    const host = document.getElementById('blocktower-preview-stack');
    if (!host) return;

    host.innerHTML = '';
    const stepMs = Math.max(260, Math.floor((this.previewSeconds * 1000) / Math.max(1, this.targetStack.length)));

    this.targetStack.forEach((colorId, index) => {
      const color = this.getColorMeta(colorId);
      window.setTimeout(() => {
        const brick = document.createElement('div');
        brick.className = 'tower-block tower-block-preview';
        brick.style.setProperty('--tower-color', color.hex);
        brick.innerHTML = `<span>${color.label}</span>`;
        brick.style.animationDelay = '0s';
        host.append(brick);
      }, index * stepMs);
    });
  }

  startPreviewCountdown() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((this.previewDeadline - Date.now()) / 1000));
      const timerEl = document.getElementById('blocktower-preview-timer');
      if (timerEl) timerEl.textContent = `${remaining}s`;

      if (remaining <= 0) {
        clearInterval(this.timerInterval);
        this.beginBuildPhase();
      }
    }, 250);
  }

  beginBuildPhase() {
    this.startTime = Date.now();
    this.timeRemaining = this.timeLimit;
    this.renderBuildPhase();
    this.startMainTimer();
  }

  bindBuildEvents() {
    if (this.buildPhaseBound || !this.container) return;
    this.container.addEventListener('click', this.handleBuildClick);
    this.buildPhaseBound = true;
  }

  handleBuildClick(event) {
    const abandonButton = event.target.closest('#blocktower-abandon');
    if (abandonButton) {
      this.abandonGame(true);
      return;
    }

    const hintButton = event.target.closest('#blocktower-hint-button');
    if (hintButton && !hintButton.disabled) {
      this.requestHint(hintButton);
      return;
    }

    const trayButton = event.target.closest('.blocktower-tray-brick[data-color-id]');
    if (trayButton && !trayButton.disabled) {
      this.sendMove('add', { colorId: trayButton.dataset.colorId }, trayButton);
      return;
    }

    const removeButton = event.target.closest('[data-remove-index]');
    if (removeButton && !removeButton.disabled) {
      this.sendMove('remove', { removeIndex: Number(removeButton.dataset.removeIndex) }, removeButton);
    }
  }

  startMainTimer() {
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isGameActive) return;

      const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
      this.timeRemaining = Math.max(0, this.timeLimit - elapsed);
      const timerEl = document.getElementById('blocktower-timer');
      if (timerEl) timerEl.textContent = `${this.timeRemaining}s`;

      if (this.timeRemaining <= 0) {
        this.handleTimeExpired();
      }
    }, 250);
  }

  syncState(data = {}) {
    this.palette = Array.isArray(data.palette) ? data.palette : this.palette;
    this.targetStack = Array.isArray(data.targetStack) ? data.targetStack : this.targetStack;
    this.inventory = data.inventory || this.inventory;
    this.availableCounts = data.availableCounts || this.availableCounts;
    this.builtStack = Array.isArray(data.builtStack) ? data.builtStack : this.builtStack;
    this.mistakes = Number(data.mistakes || 0);
    this.moveCount = Number(data.moveCount || this.moveCount);
    if (data.hint && typeof data.hint === 'object') {
      this.hint = {
        ...this.hint,
        enabled: Boolean(data.hint.enabled),
        used: Number(data.hint.used || 0),
        maxUses: Number(data.hint.maxUses || 0),
        remainingUses: Number(data.hint.remainingUses || 0),
        nextCostBronze: Number(data.hint.nextCostBronze || 0),
        nextCostPoints: Number(data.hint.nextCostPoints || 0),
        revealSeconds: Number(data.hint.revealSeconds || this.hint.revealSeconds || 10)
      };
    }
  }

  async requestHint(trigger = null) {
    if (!this.isGameActive || this.isProcessing) return;
    this.isProcessing = true;

    try {
      const response = await fetch('/api/games/blocktower/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameSessionId: this.gameSessionId,
          action: 'hint'
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || t('blocktower.hint_failed', 'Hint failed'));
      }

      this.syncState(data);
      if (data.newStats) this.applyNewStats(data.newStats);
      this.showHintOverlay(data.hintReveal?.targetStack || this.targetStack, data.hintReveal?.durationSeconds || this.hint.revealSeconds);
    } catch (err) {
      console.error('Block Tower hint failed:', err);
      if (trigger) {
        trigger.classList.add('is-wrong');
        setTimeout(() => trigger.classList.remove('is-wrong'), 300);
      }
      showNotification(err.message || t('blocktower.hint_failed', 'Hint failed'), 'error');
      this.renderBuildPhase();
    } finally {
      this.isProcessing = false;
      if (this.container?.querySelector('[data-blocktower-phase="build"]')) this.renderBuildPhase();
    }
  }

  async sendMove(action, payload = {}, trigger = null) {
    if (!this.isGameActive || this.isProcessing) return;
    this.isProcessing = true;

    try {
      const response = await fetch('/api/games/blocktower/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameSessionId: this.gameSessionId,
          action,
          ...payload
        })
      });

      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || t('blocktower.move_failed', 'Move failed'));
      }

      this.syncState(data);
      this.isProcessing = false;
      this.renderBuildPhase();

      if (data.towerLocked && data.towerMatches === false) {
        showNotification(t('blocktower.wrong_block', 'Wrong block order'), 'warn');
        const topBlock = this.container.querySelector('[data-remove-index]');
        topBlock?.classList.add('is-wrong');
        setTimeout(() => topBlock?.classList.remove('is-wrong'), 420);
      }

      if (data.gameComplete) {
        await this.finishGame();
      }
    } catch (err) {
      console.error('Block Tower move failed:', err);
      if (trigger) {
        trigger.classList.add('is-wrong');
        setTimeout(() => trigger.classList.remove('is-wrong'), 300);
      }
      showNotification(err.message || t('blocktower.move_failed', 'Move failed'), 'error');
    } finally {
      this.isProcessing = false;
    }
  }

  refreshStats() {
    const timerEl = document.getElementById('blocktower-timer');
    const progressEl = document.getElementById('blocktower-progress');
    const strikesEl = document.getElementById('blocktower-strikes');
    if (timerEl) timerEl.textContent = `${this.timeRemaining}s`;
    if (progressEl) progressEl.textContent = `${this.builtStack.length}/${this.targetStack.length}`;
    if (strikesEl) strikesEl.textContent = String(this.mistakes);
  }

  async finishGame() {
    if (!this.isGameActive) return;

    this.isGameActive = false;
    clearInterval(this.timerInterval);
    this.clearHintOverlay(false);

    try {
      const response = await fetch('/api/games/blocktower/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSessionId: this.gameSessionId })
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || t('blocktower.failed_claim_reward', 'Failed to claim reward'));
      }

      this.applyNewStats(data.newStats);
      this.showRewardModal(data.reward, data.stats, data.newStats);
    } catch (err) {
      console.error('Block Tower reward claim failed:', err);
      showNotification(err.message || t('blocktower.failed_claim_reward', 'Failed to claim reward'), 'error');
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
    this.userSnapshot = merged;
    setCachedUser(merged);
    updateTopBar(merged);
  }

  showRewardModal(reward = {}, stats = {}, newStats = {}) {
    window.hopeTriggerHaptic?.('success');
    const modal = document.createElement('div');
    modal.className = 'reward-modal';
    modal.innerHTML = `
      <div class="reward-content">
        <h2>${t('blocktower.complete_title', 'Tower Locked In!')}</h2>
        <p>${t('blocktower.complete_subtitle', 'You rebuilt the full stack before the buzzer.')}</p>

        <div class="game-stats">
          <div class="stat">
            <span class="stat-label">${t('blocktower.progress_label', 'Placed')}</span>
            <span class="stat-value">${this.targetStack.length}/${this.targetStack.length}</span>
          </div>
          <div class="stat">
            <span class="stat-label">${t('blocktower.timer_label', 'Time')}</span>
            <span class="stat-value">${Number(stats.time || 0)}s</span>
          </div>
        </div>

        <div class="rewards-earned">
          <h3>${t('blocktower.rewards_earned', 'Rewards Earned')}</h3>
          <div class="reward-item"><span>⭐ ${t('flipcards.points_label', 'Points')}</span><span class="reward-amount">+${Number(reward.points || 0)}</span></div>
          <div class="reward-item"><span>⚡ ${t('flipcards.xp_label', 'XP')}</span><span class="reward-amount">+${Number(reward.xp || 0)}</span></div>
          ${Number(reward.bronzeTickets || 0) ? `<div class="reward-item"><span>🎫 ${t('flipcards.bronze_tickets', 'Bronze Tickets')}</span><span class="reward-amount">+${Number(reward.bronzeTickets || 0)}</span></div>` : ''}
          ${Number(reward.silverTickets || 0) ? `<div class="reward-item"><span>🥈 ${t('flipcards.silver_tickets', 'Silver Tickets')}</span><span class="reward-amount">+${Number(reward.silverTickets || 0)}</span></div>` : ''}
        </div>

        <div class="new-stats">
          <p>${t('flipcards.total_points', 'Total Points:')} ${Number(newStats.points || 0)}</p>
          <p>${t('flipcards.level_label', 'Level:')} ${newStats.level || '-'}</p>
        </div>

        <button class="btn-primary" id="blocktower-replay">${t('blocktower.play_again', 'Play Again')}</button>
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#blocktower-replay')?.addEventListener('click', () => {
      modal.remove();
      this.renderDifficultySelector();
    });
  }

  handleTimeExpired() {
    if (!this.isGameActive) return;
    window.hopeTriggerHaptic?.('error');

    this.isGameActive = false;
    clearInterval(this.timerInterval);
    this.clearHintOverlay(false);
    this.abandonGame(false);

    this.container.innerHTML = `
      <div class="arcade-shell game-outcome">
        <h3>${t('blocktower.time_up', "Time's up")}</h3>
        <p>${t('blocktower.time_up_desc', 'The tower run ended before you could finish the stack.')}</p>
        <button id="blocktower-retry" class="btn-primary">${t('blocktower.try_again', 'Try Again')}</button>
      </div>
    `;
    this.container.querySelector('#blocktower-retry')?.addEventListener('click', () => this.renderDifficultySelector());
  }

  async abandonGame(returnToMarket = false) {
    clearInterval(this.timerInterval);
    this.clearHintOverlay(false);
    const sessionId = this.gameSessionId;
    this.gameSessionId = null;
    this.isGameActive = false;

    if (sessionId) {
      try {
        await fetch(`/api/games/blocktower/session/${sessionId}`, {
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

const game = new BlockTowerGame();
window.blockTowerGame = game;

document.addEventListener('DOMContentLoaded', () => {
  game.init();
});
