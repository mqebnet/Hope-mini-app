// load-tests/stress.test.js
// -----------------------------------------------------------------------------
// Stress test for major app flows with endpoint-level visibility.
// Includes all pass-gated games so we can validate behavior across the full
// arcade surface, not just Flip Cards.
// -----------------------------------------------------------------------------

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { AUTH_HEADERS, THRESHOLDS, ROUTES } from './config.js';

const PASS_GAMES = ['flipcards', 'blocktower', 'slidingtiles', 'shellgame'];

const START_ENDPOINTS = {
  flipcards: 'POST /api/games/flipcards/start',
  blocktower: 'POST /api/games/blocktower/start',
  slidingtiles: 'POST /api/games/slidingtiles/start',
  shellgame: 'POST /api/games/shellgame/start',
};

const SESSION_ENDPOINTS = {
  flipcards: 'GET /api/games/flipcards/session/:gameSessionId',
  blocktower: 'GET /api/games/blocktower/session/:gameSessionId',
  slidingtiles: 'GET /api/games/slidingtiles/session/:gameSessionId',
  shellgame: 'GET /api/games/shellgame/session/:gameSessionId',
};

const ENDPOINTS = {
  me: 'GET /api/user/me',
  checkInStatus: 'GET /api/dailyCheckIn/status',
  inviteLink: 'GET /api/invite/link',
  leaderboard: 'GET /api/leaderboard/by-level/:level',
  taskDefs: 'GET /api/tasks/definitions',
  taskPending: 'GET /api/tasks/pending-verifications',
  inviteProgress: 'GET /api/invite/progress',
  staticCSS: 'GET /styles.css',
  flipcardsMove: 'POST /api/games/flipcards/move',
  flipcardsComplete: 'POST /api/games/flipcards/complete',
  ...START_ENDPOINTS,
  ...SESSION_ENDPOINTS,
};

const ENDPOINT_NAMES = Object.values(ENDPOINTS);

const endpointDurationThresholds = Object.fromEntries(
  ENDPOINT_NAMES.map((name) => [
    `http_req_duration{endpoint:${name}}`,
    ['p(95)<1500', 'p(99)<4000'],
  ])
);

const endpointFailureThresholds = Object.fromEntries(
  ENDPOINT_NAMES.map((name) => [
    `http_req_failed{endpoint:${name}}`,
    ['rate<0.10'],
  ])
);

const gameStartErrors = new Counter('game_start_errors');
const gamePassLocked = new Counter('game_pass_locked');
const gameMoveDuration = new Trend('game_move_duration');
const rateLimitHits = new Counter('rate_limit_hits');
const leaderboardLatency = new Trend('leaderboard_latency');
let arcadeGameCursor = 0;

const maxVUs = parseInt(__ENV.MAX_VUS || '50', 10);
const expectedStartStatuses = http.expectedStatuses(200, 402);

export const options = {
  stages: [
    { duration: '1m', target: Math.floor(maxVUs * 0.2) },
    { duration: '2m', target: Math.floor(maxVUs * 0.5) },
    { duration: '3m', target: maxVUs },
    { duration: '3m', target: maxVUs },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    ...THRESHOLDS,
    ...endpointDurationThresholds,
    ...endpointFailureThresholds,
    game_move_duration: ['p(95)<800'],
    leaderboard_latency: ['p(95)<50'],
    rate_limit_hits: ['count<50'],
  },
};

function taggedGet(url, endpoint, extra = {}) {
  return http.get(url, {
    ...extra,
    tags: {
      name: endpoint,
      endpoint,
      ...(extra.tags || {}),
    },
  });
}

function taggedPost(url, body, endpoint, extra = {}) {
  return http.post(url, body, {
    ...extra,
    tags: {
      name: endpoint,
      endpoint,
      ...(extra.tags || {}),
    },
  });
}

function parseJson(response) {
  try {
    return JSON.parse(response.body);
  } catch {
    return null;
  }
}

function randomFrom(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function nextArcadeGameId() {
  const gameId = PASS_GAMES[arcadeGameCursor % PASS_GAMES.length];
  arcadeGameCursor += 1;
  return gameId;
}

function recordRateLimit(response, endpoint, extraTags = {}) {
  if (response.status === 429) {
    rateLimitHits.add(1, { endpoint, ...extraTags });
  }
}

function recordLeaderboardLatency(startTime, extraTags = {}) {
  leaderboardLatency.add(Date.now() - startTime, {
    endpoint: ENDPOINTS.leaderboard,
    ...extraTags,
  });
}

function getStartEndpoint(gameId) {
  return START_ENDPOINTS[gameId] || 'POST /api/games/:gameId/start';
}

function getSessionEndpoint(gameId) {
  return SESSION_ENDPOINTS[gameId] || 'GET /api/games/:gameId/session/:gameSessionId';
}

function startPassGame(gameId, payload = {}) {
  const endpoint = getStartEndpoint(gameId);
  const difficulty = String(payload?.difficulty || '');

  const startRes = taggedPost(
    ROUTES.gameStart(gameId),
    JSON.stringify(payload),
    endpoint,
    {
      headers: AUTH_HEADERS,
      responseCallback: expectedStartStatuses,
      tags: {
        gameId,
        ...(difficulty ? { difficulty } : {}),
      },
    }
  );

  recordRateLimit(startRes, endpoint, { gameId, ...(difficulty ? { difficulty } : {}) });

  if (startRes.status === 402) {
    gamePassLocked.add(1, { gameId, endpoint });
    return { locked: true, status: 402, response: startRes };
  }

  if (startRes.status !== 200) {
    gameStartErrors.add(1, { gameId, endpoint, ...(difficulty ? { difficulty } : {}) });
    return { locked: false, status: startRes.status, response: startRes };
  }

  const body = parseJson(startRes);
  const gameSessionId = body?.gameSessionId || null;
  if (!gameSessionId) {
    gameStartErrors.add(1, { gameId, endpoint, reason: 'missing-game-session-id' });
  }

  return {
    locked: false,
    status: 200,
    response: startRes,
    body,
    gameSessionId,
  };
}

export default function () {
  const roll = Math.random();

  if (roll < 0.38) {
    casualBrowse();
  } else if (roll < 0.68) {
    playArcadeGame();
  } else if (roll < 0.82) {
    checkLeaderboard();
  } else if (roll < 0.94) {
    checkTasksAndInvite();
  } else {
    browseStaticAssets();
  }
}

function casualBrowse() {
  group('casual browse', () => {
    const meRes = taggedGet(ROUTES.me, ENDPOINTS.me, { headers: AUTH_HEADERS });
    check(meRes, { 'GET /api/user/me -> 200': (r) => r.status === 200 });
    recordRateLimit(meRes, ENDPOINTS.me);
    sleep(2);

    const checkInRes = taggedGet(ROUTES.checkInStatus, ENDPOINTS.checkInStatus, {
      headers: AUTH_HEADERS,
    });
    check(checkInRes, { 'GET /api/dailyCheckIn/status -> 200': (r) => r.status === 200 });
    recordRateLimit(checkInRes, ENDPOINTS.checkInStatus);
    sleep(3);

    const inviteLinkRes = taggedGet(ROUTES.inviteLink, ENDPOINTS.inviteLink, {
      headers: AUTH_HEADERS,
    });
    check(inviteLinkRes, { 'GET /api/invite/link -> 200': (r) => r.status === 200 });
    recordRateLimit(inviteLinkRes, ENDPOINTS.inviteLink);
    sleep(2);
  });
}

function playArcadeGame() {
  const gameId = nextArcadeGameId();
  if (gameId === 'flipcards') {
    playFlipCards();
    return;
  }

  group(`${gameId} game`, () => {
    const difficulty = randomFrom(['easy', 'normal']);
    const started = startPassGame(gameId, { difficulty });

    check(started.response, {
      [`${getStartEndpoint(gameId)} -> 200 or 402`]: (r) => r.status === 200 || r.status === 402,
    });

    if (started.locked || started.status !== 200 || !started.gameSessionId) {
      sleep(2);
      return;
    }

    const sessionEndpoint = getSessionEndpoint(gameId);
    const sessionRes = taggedGet(
      ROUTES.gameSession(gameId, started.gameSessionId),
      sessionEndpoint,
      { headers: AUTH_HEADERS, tags: { gameId, difficulty } }
    );
    check(sessionRes, {
      [`${sessionEndpoint} -> 200`]: (r) => r.status === 200,
      [`${gameId} session has status`]: (r) => Boolean(parseJson(r)?.status),
    });
    recordRateLimit(sessionRes, sessionEndpoint, { gameId, difficulty });
    sleep(2);
  });
}

function playFlipCards() {
  group('flipcards game', () => {
    const difficulty = randomFrom(['easy', 'normal']);
    const started = startPassGame('flipcards', { difficulty });

    check(started.response, {
      'POST /api/games/flipcards/start -> 200 or 402': (r) => r.status === 200 || r.status === 402,
    });

    if (started.locked || started.status !== 200) {
      sleep(2);
      return;
    }

    const gameSessionId = started.gameSessionId;
    const cards = Array.isArray(started.body?.cards) ? started.body.cards : [];
    if (!gameSessionId || !cards.length) {
      gameStartErrors.add(1, { gameId: 'flipcards', reason: 'missing-session-or-cards' });
      sleep(2);
      return;
    }

    const bySymbol = {};
    for (const card of cards) {
      if (!bySymbol[card.symbol]) bySymbol[card.symbol] = [];
      bySymbol[card.symbol].push(card.id);
    }

    const triplets = Object.values(bySymbol).filter((ids) => ids.length === 3);
    if (!triplets.length) {
      sleep(2);
      return;
    }

    const movesToPlay = Math.min(Math.floor(Math.random() * 2) + 2, triplets.length);
    let gameComplete = false;

    for (let i = 0; i < movesToPlay; i++) {
      const moveStartedAt = Date.now();
      const moveRes = taggedPost(
        ROUTES.gameMove('flipcards'),
        JSON.stringify({
          gameSessionId,
          cardIds: triplets[i],
          clientDuration: Math.floor(Math.random() * 3000) + 1000,
        }),
        ENDPOINTS.flipcardsMove,
        {
          headers: AUTH_HEADERS,
          tags: { gameId: 'flipcards', difficulty, moveIndex: String(i + 1) },
        }
      );

      gameMoveDuration.add(Date.now() - moveStartedAt, {
        endpoint: ENDPOINTS.flipcardsMove,
        gameId: 'flipcards',
        difficulty,
      });
      recordRateLimit(moveRes, ENDPOINTS.flipcardsMove, { gameId: 'flipcards', difficulty });

      check(moveRes, {
        'POST /api/games/flipcards/move -> not 500': (r) => r.status !== 500,
        'POST /api/games/flipcards/move -> not 404': (r) => r.status !== 404,
      });

      const moveBody = parseJson(moveRes);
      if (moveRes.status === 200 && moveBody?.gameComplete) {
        gameComplete = true;
        break;
      }

      sleep(Math.random() * 2 + 1);
    }

    if (!gameComplete) {
      sleep(2);
      return;
    }

    const completeRes = taggedPost(
      ROUTES.gameComplete('flipcards'),
      JSON.stringify({ gameSessionId }),
      ENDPOINTS.flipcardsComplete,
      { headers: AUTH_HEADERS, tags: { gameId: 'flipcards', difficulty } }
    );

    recordRateLimit(completeRes, ENDPOINTS.flipcardsComplete, { gameId: 'flipcards', difficulty });
    check(completeRes, {
      'POST /api/games/flipcards/complete -> not 500': (r) => r.status !== 500,
      'POST /api/games/flipcards/complete -> not 404': (r) => r.status !== 404,
    });

    sleep(3);
  });
}

function checkLeaderboard() {
  group('leaderboard', () => {
    const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const picked = levels.sort(() => Math.random() - 0.5).slice(0, 2);

    for (const level of picked) {
      const startedAt = Date.now();
      const leaderboardRes = taggedGet(ROUTES.leaderboard(level), ENDPOINTS.leaderboard, {
        headers: AUTH_HEADERS,
        tags: { level: String(level) },
      });

      recordLeaderboardLatency(startedAt, { level: String(level) });
      recordRateLimit(leaderboardRes, ENDPOINTS.leaderboard, { level: String(level) });

      check(leaderboardRes, {
        'GET /api/leaderboard/by-level/:level -> 200': (r) => r.status === 200,
        'leaderboard response has users array': (r) => Array.isArray(parseJson(r)?.users),
      });

      sleep(4);
    }
  });
}

function checkTasksAndInvite() {
  group('tasks and invite', () => {
    const taskDefsRes = taggedGet(ROUTES.taskDefs, ENDPOINTS.taskDefs, {
      headers: AUTH_HEADERS,
    });
    check(taskDefsRes, { 'GET /api/tasks/definitions -> 200': (r) => r.status === 200 });
    recordRateLimit(taskDefsRes, ENDPOINTS.taskDefs);
    sleep(2);

    const pendingRes = taggedGet(ROUTES.taskPending, ENDPOINTS.taskPending, {
      headers: AUTH_HEADERS,
    });
    check(pendingRes, {
      'GET /api/tasks/pending-verifications -> 200': (r) => r.status === 200,
    });
    recordRateLimit(pendingRes, ENDPOINTS.taskPending);
    sleep(1);

    const inviteProgressRes = taggedGet(ROUTES.inviteProgress, ENDPOINTS.inviteProgress, {
      headers: AUTH_HEADERS,
    });
    check(inviteProgressRes, { 'GET /api/invite/progress -> 200': (r) => r.status === 200 });
    recordRateLimit(inviteProgressRes, ENDPOINTS.inviteProgress);
    sleep(3);
  });
}

function browseStaticAssets() {
  group('static assets', () => {
    const cssRes = taggedGet(ROUTES.staticCSS, ENDPOINTS.staticCSS, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    check(cssRes, {
      'GET /styles.css -> 200 or 304': (r) => r.status === 200 || r.status === 304,
    });
    recordRateLimit(cssRes, ENDPOINTS.staticCSS);
    sleep(1);
  });
}
