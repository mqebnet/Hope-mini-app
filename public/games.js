/**
 * Games launcher powered by backend Games Engine catalog.
 * New games become visible automatically once registered server-side.
 */

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

export async function loadGamesCatalog() {
  try {
    const res = await fetch('/api/games/catalog', { credentials: 'include', cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data?.games)) {
      return FALLBACK_GAMES;
    }
    return data.games;
  } catch (_) {
    return FALLBACK_GAMES;
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
          <span>Play</span>
          <span class="arrow">→</span>
        </button>
      </div>
    `;

    const playBtn = card.querySelector('.btn-play');
    playBtn?.addEventListener('click', () => openGame(game.id));
    container.appendChild(card);
  });
}

export function openGame(gameId) {
  if (gameId === 'mystery-box') {
    window.location.href = 'mysteryBox.html';
    return;
  }

  if (gameId === 'flipcards') {
    window.location.href = 'flipcardsPass.html';
    return;
  }

  if (typeof window.showWarningToast === 'function') {
    window.showWarningToast('This game is coming soon.');
  } else {
    alert('This game is coming soon.');
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
