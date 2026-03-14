/**
 * Flip Cards Game Module
 *
 * Features:
 * - Triplet matching (match 3 cards per set)
 * - 60-second timer
 * - Card flip animations
 * - Move tracking and validation
 * - Reward display
 * - Responsive mobile design
 */

import { debounceButton } from './utils.js';
const FLIPCARDS_PASS_USD = 0.55;

export class FlipCardsGame {
  constructor() {
    this.gameSessionId = null;
    this.cards = [];
    this.flippedCards = [];
    this.matchedTriplets = [];
    this.isProcessing = false;
    this.isAbandoningGame = false;
    this.timeRemaining = 60;
    this.timeLimit = 60;
    this.startTime = null;
    this.timerInterval = null;
    this.difficulty = 'normal'; // easy, normal, hard
    this.gameContainer = null;
    this.isGameActive = false;
  }

  /**
   * Initialize and start a new game
   */
  async startGame(difficulty = 'normal') {
    this.difficulty = difficulty;

    try {
      const response = await fetch('/api/games/flipcards/start', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty })
      });

      const data = await response.json();
      
      // Check if daily pass is required (402 status from backend)
      if (response.status === 402) {
        window.location.href = 'flipcardsPass.html';
        return { success: false };
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to start game');
      }

      this.gameSessionId = data.gameSessionId;
      this.cards = data.cards;
      this.timeLimit = data.timeLimit;
      this.timeRemaining = this.timeLimit;
      this.matchedTriplets = [];
      this.flippedCards = [];
      this.isGameActive = true;
      this.startTime = Date.now();

      // Render game board
      this.renderBoard();

      // Start timer
      this.startTimer();

      return { success: true, gameSessionId: this.gameSessionId };
    } catch (err) {
      console.error('Failed to start game:', err);
      this.showNotification(err.message || 'Failed to start game', 'error');
      return { success: false };
    }
  }

  /**
   * Show daily pass purchase screen
   */
  showPurchasePassScreen() {
    const gameContainer = document.getElementById('flipcards-game');
    if (!gameContainer) return;

    // Clear existing content
    gameContainer.innerHTML = '';

    const passScreen = document.createElement('div');
    passScreen.className = 'pass-purchase-screen';
    passScreen.innerHTML = `
      <div class="pass-card">
        <div class="pass-icon">🎫</div>
        <h2>Daily Pass Required</h2>
        <p class="pass-description">Unlock unlimited Flip Cards gameplay for 24 hours</p>
        
        <div class="pass-features">
          <div class="feature">
            <span class="feature-icon">♾️</span>
            <span>Play unlimited games</span>
          </div>
          <div class="feature">
            <span class="feature-icon">⏰</span>
            <span>Valid for 24 hours</span>
          </div>
          <div class="feature">
            <span class="feature-icon">⭐</span>
            <span>Earn full rewards</span>
          </div>
        </div>

        <div class="pass-price">
          <span class="price-label">Daily Pass</span>
          <span class="price-amount">$${FLIPCARDS_PASS_USD.toFixed(2)}</span>
        </div>

        <button class="btn-purchase-pass" onclick="window.flipCardsGame.purchasePass()">
          Purchase Daily Pass
        </button>

        <button class="btn-cancel-pass" onclick="window.location.href='marketPlace.html'">
          Back to Games
        </button>
      </div>
    `;

    gameContainer.appendChild(passScreen);
  }

  /**
   * Purchase daily pass
   */
  async purchasePass() {
    window.location.href = 'flipcardsPass.html';
  }

  /**
   * Render the game board
   */
  renderBoard() {
    if (!this.gameContainer) {
      this.gameContainer = document.getElementById('flipcards-board');
    }

    if (!this.gameContainer) {
      console.error('Game container not found');
      return;
    }

    this.gameContainer.innerHTML = '';
    this.gameContainer.className = 'flipcards-board';

    this.cards.forEach((card) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'flipcard';
      cardEl.dataset.cardId = card.id;
      cardEl.dataset.revealed = card.revealed;

      const cardInner = document.createElement('div');
      cardInner.className = 'flipcard-inner';

      const cardFront = document.createElement('div');
      cardFront.className = 'flipcard-front';
      cardFront.innerHTML = '?';

      const cardBack = document.createElement('div');
      cardBack.className = 'flipcard-back';
      cardBack.innerHTML = card.symbol;

      cardInner.appendChild(cardFront);
      cardInner.appendChild(cardBack);
      cardEl.appendChild(cardInner);

      // Click handler
      if (!card.revealed) {
        const clickHandler = () => this.onCardClick(card.id);
        cardEl.__flipClickHandler = clickHandler;
        cardEl.addEventListener('click', clickHandler);
      } else {
        cardEl.classList.add('revealed');
      }

      this.gameContainer.appendChild(cardEl);
    });
  }

  /**
   * Handle card click
   */
  onCardClick(cardId) {
    if (this.isProcessing || !this.isGameActive) return;

    // Can flip up to 3 cards at a time (for triplet matching)
    if (this.flippedCards.length >= 3) {
      return;
    }

    // Already flipped?
    if (this.flippedCards.includes(cardId)) {
      return;
    }

    // Already matched?
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) return;
    if (card.revealed) return;

    const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
    if (!cardEl) return;

    // Flip animation
    cardEl.classList.add('flipped');
    this.flippedCards.push(cardId);

    // If 3 cards flipped, check for match
    if (this.flippedCards.length === 3) {
      this.checkMove();
    }
  }

  /**
   * Check if the flipped cards form a valid triplet
   */
  async checkMove() {
    this.isProcessing = true;

    const clientDuration = Date.now() - this.startTime;

    try {
      const response = await fetch('/api/games/flipcards/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameSessionId: this.gameSessionId,
          cardIds: this.flippedCards,
          clientDuration
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Move failed');
      }

      // Check if matched
      if (data.matched) {
        // Mark as matched
        this.matchedTriplets.push(data.matchedTripletId);
        this.flippedCards.forEach((cardId) => {
          const card = this.cards.find((c) => c.id === cardId);
          const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
          if (card) card.revealed = true;
          if (cardEl) {
            cardEl.classList.add('matched');
            cardEl.classList.remove('flipped');
            const handler = cardEl.__flipClickHandler;
            if (handler) {
              cardEl.removeEventListener('click', handler);
              delete cardEl.__flipClickHandler;
            }
          }
        });

        // Success animation
        this.showNotification('✓ Match! 🎉', 'success');
      } else {
        // No match - flip back after a delay
        await new Promise((resolve) => setTimeout(resolve, 800));
        this.flippedCards.forEach((cardId) => {
          const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
          if (cardEl) {
            cardEl.classList.remove('flipped');
          }
        });
      }

      // Clear flipped cards
      this.flippedCards = [];

      // Check if game completed
      if (data.gameComplete) {
        this.endGame(data.reward);
      }
    } catch (err) {
      console.error('Move failed:', err);
      // Flip cards back on error
      this.flippedCards.forEach((cardId) => {
        const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
        if (cardEl) cardEl.classList.remove('flipped');
      });
      this.flippedCards = [];
      this.showNotification(err.message || 'Move failed', 'error');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Start the game timer
   */
  startTimer() {
    this.timerInterval = setInterval(() => {
      this.timeRemaining -= 1;

      // Update UI
      const timerEl = document.getElementById('flipcards-timer');
      if (timerEl) {
        timerEl.textContent = this.formatTime(this.timeRemaining);
        if (this.timeRemaining <= 15) {
          timerEl.classList.add('warning');
        }
      }

      // Time's up
      if (this.timeRemaining <= 0) {
        this.timeExpired();
      }
    }, 1000);
  }

  /**
   * Handle time expiration
   */
  async timeExpired() {
    this.isGameActive = false;
    clearInterval(this.timerInterval);

    // Abandon the game on server
    try {
      await fetch(`/api/games/flipcards/${this.gameSessionId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Failed to abandon game:', err);
    }

    this.showGameOverScreen('Time\'s Up!', 'Game Over', false);
  }

  /**
   * End game and claim reward
   */
  async endGame(reward) {
    this.isGameActive = false;
    clearInterval(this.timerInterval);

    try {
      const response = await fetch('/api/games/flipcards/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSessionId: this.gameSessionId })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to claim reward');
      }

      // Show reward screen
      this.showRewardScreen(data.reward, data.stats, data.newStats);
    } catch (err) {
      console.error('Failed to complete game:', err);
      this.showGameOverScreen('Error', err.message, false);
    }
  }

  /**
   * Display reward screen
   */
  showRewardScreen(reward = {}, stats = {}, newStats = {}) {
    const safeReward = {
      points: Number(reward?.points || 0),
      xp: Number(reward?.xp || 0),
      bronzeTickets: Number(reward?.bronzeTickets || 0)
    };
    const safeStats = {
      moves: Number(stats?.moves || 0),
      time: Number(stats?.time || 0)
    };
    const safeNewStats = {
      points: Number(newStats?.points || 0),
      level: newStats?.level || 'Seeker'
    };

    const modal = document.createElement('div');
    modal.className = 'reward-modal';
    modal.innerHTML = `
      <div class="reward-content">
        <h2>🎉 Game Complete!</h2>
        
        <div class="game-stats">
          <div class="stat">
            <span class="stat-label">Moves Made:</span>
            <span class="stat-value">${safeStats.moves}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Time Used:</span>
            <span class="stat-value">${this.formatTime(safeStats.time)}</span>
          </div>
        </div>

        <div class="rewards-earned">
          <h3>Rewards Earned</h3>
          <div class="reward-item">
            <span>⭐ Points</span>
            <span class="reward-amount">+${safeReward.points}</span>
          </div>
          <div class="reward-item">
            <span>✨ XP</span>
            <span class="reward-amount">+${safeReward.xp}</span>
          </div>
          ${safeReward.bronzeTickets > 0 ? `
            <div class="reward-item">
              <span>🎫 Bronze Tickets</span>
              <span class="reward-amount">+${safeReward.bronzeTickets}</span>
            </div>
          ` : ''}
        </div>

        <div class="new-stats">
          <p><strong>Total Points:</strong> ${safeNewStats.points}</p>
          <p><strong>Level:</strong> ${safeNewStats.level}</p>
        </div>

        <button class="btn-primary" onclick="window.location.href='marketPlace.html'">Back to Games</button>
      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Display game over screen
   */
  showGameOverScreen(title, message, isVictory) {
    const modal = document.createElement('div');
    modal.className = 'reward-modal';
    modal.innerHTML = `
      <div class="reward-content">
        <h2>${isVictory ? '🎉' : '😞'} ${title}</h2>
        <p>${message}</p>
        <button class="btn-primary" onclick="window.location.href='marketPlace.html'">Back to Games</button>
      </div>
    `;

    document.body.appendChild(modal);
  }

  /**
   * Format seconds to MM:SS
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Show notification toast
   */
  showNotification(message, type = 'info') {
    if (typeof window.showSuccessToast === 'function' && type === 'success') {
      window.showSuccessToast(message);
      return;
    }
    if (typeof window.showErrorToast === 'function' && type === 'error') {
      window.showErrorToast(message);
      return;
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  /**
   * Abandon current game
   */
  async abandonGame() {
    // Prevent double abandons
    if (this.isAbandoningGame || !this.gameSessionId) return;
    this.isAbandoningGame = true;

    this.isGameActive = false;
    clearInterval(this.timerInterval);

    try {
      await fetch(`/api/games/flipcards/${this.gameSessionId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      window.location.href = 'marketPlace.html';
    } catch (err) {
      console.error('Failed to abandon game:', err);
      this.showNotification(err.message || 'Failed to abandon game', 'error');
      this.isAbandoningGame = false;
    }
  }
}

// Global instance
window.flipCardsGame = null;

/**
 * Initialize Flip Cards game UI
 */
export function initFlipCardsGame() {
  const gameContainer = document.getElementById('flipcards-game');
  if (!gameContainer) return;

  let isStartingGame = false;

  // Render difficulty selector
  const difficultySelector = document.createElement('div');
  difficultySelector.className = 'difficulty-selector';
  difficultySelector.innerHTML = `
    <h3>Select Difficulty</h3>
    <div class="difficulty-buttons">
      <button class="difficulty-btn" data-difficulty="easy">
        <span class="icon">🌱</span>
        Easy (3 Triplets)
      </button>
      <button class="difficulty-btn" data-difficulty="normal">
        <span class="icon">⚡</span>
        Normal (4 Triplets)
      </button>
      <button class="difficulty-btn" data-difficulty="hard">
        <span class="icon">🔥</span>
        Hard (5 Triplets)
      </button>
    </div>
  `;

  gameContainer.appendChild(difficultySelector);

  // Difficulty button handlers
  document.querySelectorAll('.difficulty-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      // Debounce button: prevent double clicks
      if (!debounceButton(btn, 500)) return;
      if (isStartingGame || window.flipCardsGame?.isGameActive) return;
      isStartingGame = true;

      const difficulty = btn.dataset.difficulty;
      const game = new FlipCardsGame();
      window.flipCardsGame = game;

      // Create game UI first (before startGame)
      difficultySelector.style.display = 'none';
      renderGameUI(gameContainer);

      // Now start the game (which will find #flipcards-board)
      const result = await game.startGame(difficulty);
      if (!result.success) {
        console.error('Failed to start game');
        isStartingGame = false;
        return;
      }
      isStartingGame = false;
    });
  });
}

/**
 * Render active game UI
 */
function renderGameUI(container) {
  const gameUI = document.createElement('div');
  gameUI.className = 'flipcards-ui';
  gameUI.innerHTML = `
    <div class="flipcards-header">
      <div class="flipcards-timer" id="flipcards-timer">1:00</div>
      <h2>Match the Triplets!</h2>
      <button class="btn-abandon" onclick="window.flipCardsGame.abandonGame()">✕ Quit</button>
    </div>
    <div class="flipcards-board" id="flipcards-board"></div>
    <div class="flipcards-instructions">
      <p>Find groups of 3 matching cards</p>
    </div>
  `;

  container.appendChild(gameUI);
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initFlipCardsGame);


