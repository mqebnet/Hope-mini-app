/**
 * Games launcher powered by backend Games Engine catalog.
 * New games become visible automatically once registered server-side.
 */

import { i18n } from './i18n.js';
import { navigateWithFeedback } from './utils.js';

const FALLBACK_GAMES = [
  {
    id: 'mystery-box',
    name: 'Mystery Box',
    description: 'Buy and open reward boxes to claim instant rewards.',
    icon: '🎁'
  },
  {
    id: 'flipcards',
    name: 'Flip Cards',
    description: 'Match triplets of cards to win rewards. 60 seconds to match them all.',
    icon: '🎴'
  }
];

function localizeFallbackGames() {
  return FALLBACK_GAMES.map((game) => {
    if (game.id === 'mystery-box') {
      return {
        ...game,
        name: i18n.t('games.mystery_box_name'),
        description: i18n.t('games.mystery_box_desc')
      };
    }
    if (game.id === 'flipcards') {
      return {
        ...game,
        name: i18n.t('games.flipcards_name'),
        description: i18n.t('games.flipcards_desc')
      };
    }
    return game;
  });
}

export async function loadGamesCatalog() {
  try {
    const res = await fetch('/api/games/catalog', { credentials: 'include', cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.games)) {
      return localizeFallbackGames();
    }
    return data.games;
  } catch (_) {
    return localizeFallbackGames();
  }
}

export async function renderGamesGrid(containerId = 'games-grid') {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  container.className = 'games-grid';

  const games = await loadGamesCatalog();
  games.forEach((game) => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.dataset.gameId = game.id;
    card.innerHTML = `
      <div class="game-card-inner">
        <div class="game-icon">${game.icon || '🎮'}</div>
        <h3 class="game-name">${game.name || game.id}</h3>
        <p class="game-description">${game.description || ''}</p>
        <button class="btn-play" data-game-id="${game.id}">
          <span>${i18n.t('games.play')}</span>
          <span class="arrow">→</span>
        </button>
      </div>
    `;

    const playBtn = card.querySelector('.btn-play');
    playBtn?.addEventListener('click', () => openGame(game.id, playBtn));
    container.appendChild(card);
  });
  window.hopeApplyTranslations?.();
}

export function openGame(gameId, trigger = null) {
  if (gameId === 'mystery-box') {
    navigateWithFeedback('mysteryBox.html', trigger);
    return;
  }

  if (gameId === 'flipcards') {
    navigateWithFeedback('flipcardsPass.html', trigger);
    return;
  }

  if (typeof window.showWarningToast === 'function') {
    window.showWarningToast(i18n.t('games.coming_soon'));
  } else {
    alert(i18n.t('games.coming_soon'));
  }
}

export async function initGamesSection() {
  const gamesContainer = document.getElementById('games-container');
  if (!gamesContainer) return;
  await renderGamesGrid('games-grid');
}

async function init() {
  await initGamesSection();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
