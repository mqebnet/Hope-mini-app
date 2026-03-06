/**
 * Games Module
 *
 * Manages game launcher and game selection
 * Dynamically loads game components
 */

import { FlipCardsGame } from './flipCards.js';

/**
 * Game catalog
 * Add new games here for easy extension
 */
const GAMES_CATALOG = [
  {
    id: 'mystery-box',
    name: 'Mystery Box',
    description: 'Open reward boxes and discover hidden HOPE rewards.',
    icon: '🎁',
    component: 'mystery-box',
    route: 'marketPlace.html' // Existing feature
  },
  {
    id: 'flip-cards',
    name: 'Flip Cards',
    description: 'Match triplets of cards to win rewards. 60 seconds to match them all!',
    icon: '🎴',
    component: 'flip-cards',
    route: 'flipcards.html'
  }
  // Future games:
  // {
  //   id: 'memory-blocks',
  //   name: 'Memory Blocks',
  //   description: 'Tap blocks in the correct sequence before time runs out.',
  //   icon: '🧩',
  //   component: 'memory-blocks',
  //   route: 'memoryblocks.html'
  // },
  // {
  //   id: 'token-rush',
  //   name: 'Token Rush',
  //   description: 'Collect tokens and avoid obstacles in this fast-paced game.',
  //   icon: '💨',
  //   component: 'token-rush',
  //   route: 'tokenrush.html'
  // }
];

/**
 * Render games grid
 */
export function renderGamesGrid(containerId = 'games-grid') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error(`Container #${containerId} not found`);
    return;
  }

  container.innerHTML = '';
  container.className = 'games-grid';

  GAMES_CATALOG.forEach((game) => {
    const card = createGameCard(game);
    container.appendChild(card);
  });
}

/**
 * Create a game card element
 */
function createGameCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';
  card.dataset.gameId = game.id;

  card.innerHTML = `
    <div class="game-card-inner">
      <div class="game-icon">${game.icon}</div>
      <h3 class="game-name">${game.name}</h3>
      <p class="game-description">${game.description}</p>
      <button class="btn-play" data-game-id="${game.id}">
        <span>Play</span>
        <span class="arrow">→</span>
      </button>
    </div>
  `;

  // Hover effects
  card.addEventListener('mouseenter', () => {
    card.classList.add('hovered');
  });

  card.addEventListener('mouseleave', () => {
    card.classList.remove('hovered');
  });

  // Play button
  const playBtn = card.querySelector('.btn-play');
  playBtn.addEventListener('click', async () => {
    await openGame(game.id);
  });

  return card;
}

/**
 * Open a game
 *
 * @param {string} gameId - Game identifier
 */
export async function openGame(gameId) {
  const game = GAMES_CATALOG.find((g) => g.id === gameId);
  if (!game) {
    console.error(`Game not found: ${gameId}`);
    return;
  }

  console.log(`Opening game: ${game.name}`);

  // Route to appropriate game handler
  switch (game.id) {
    case 'mystery-box':
      openMysteryBoxGame();
      break;
    case 'flip-cards':
      openFlipCardsGame();
      break;
    default:
      console.warn(`No handler for game: ${gameId}`);
  }
}

/**
 * Open Mystery Box game (existing feature)
 */
function openMysteryBoxGame() {
  // Mystery Box is already integrated in the Marketplace
  // This would redirect or show the mystery box section
  window.location.href = 'marketPlace.html?tab=puzzles';
}

/**
 * Open Flip Cards game
 */
async function openFlipCardsGame() {
  // Navigate to flip cards game page
  window.location.href = 'flipcards.html';
}

/**
 * Initialize games section
 * Call this when the games section is loaded
 */
export function initGamesSection() {
  const gamesContainer = document.getElementById('games-container');
  if (!gamesContainer) {
    console.log('Games container not found');
    return;
  }

  // Check if we already have a grid
  if (!document.getElementById('games-grid')) {
    const gridContainer = document.createElement('div');
    gridContainer.id = 'games-grid';
    gamesContainer.appendChild(gridContainer);
  }

  renderGamesGrid('games-grid');

  // Add event delegation for dynamic content
  document.addEventListener('click', async (e) => {
    if (e.target.closest('.btn-play')) {
      const gameId = e.target.closest('.btn-play').dataset.gameId;
      if (gameId) {
        await openGame(gameId);
      }
    }
  });
}

/**
 * Get game details by ID
 */
export function getGameDetails(gameId) {
  return GAMES_CATALOG.find((g) => g.id === gameId);
}

/**
 * Get all games
 */
export function getAllGames() {
  return [...GAMES_CATALOG];
}

// Auto-initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGamesSection);
} else {
  initGamesSection();
}
