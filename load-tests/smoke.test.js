// load-tests/smoke.test.js
// -----------------------------------------------------------------------------
// Smoke test - run this first before any other load test.
// 5 virtual users for 1 minute. Verifies key endpoints return the expected
// status codes before running heavier scenarios.
//
// Run:
//   k6 run load-tests/smoke.test.js
//   k6 run --env BASE_URL=https://your-ngrok-url load-tests/smoke.test.js
// -----------------------------------------------------------------------------

import http from 'k6/http';
import { check, sleep } from 'k6';
import { AUTH_HEADERS, THRESHOLDS, ROUTES } from './config.js';

const ENDPOINT_NAMES = [
  'GET /api/user/me',
  'GET /api/dailyCheckIn/status',
  'GET /api/leaderboard/by-level/1',
  'GET /api/games/catalog',
  'GET /api/tasks/definitions',
  'GET /api/invite/progress',
  'GET /styles.css',
];

const endpointThresholds = Object.fromEntries(
  ENDPOINT_NAMES.map((name) => [
    `http_req_duration{endpoint:${name}}`,
    ['p(95)<500', 'p(99)<1500'],
  ])
);

export const options = {
  vus: 5,
  duration: '1m',
  thresholds: {
    ...THRESHOLDS,
    ...endpointThresholds,
    // Smoke test is strict - nearly everything should pass.
    http_req_failed: ['rate<0.005'],
  },
};

function taggedGet(url, name, extra = {}) {
  return http.get(url, {
    ...extra,
    tags: {
      name,
      endpoint: name,
      ...(extra.tags || {}),
    },
  });
}

function getHeaderValue(response, headerName) {
  if (!response?.headers) return '';

  const match = Object.entries(response.headers).find(
    ([key]) => String(key).toLowerCase() === String(headerName).toLowerCase()
  );
  if (!match) return '';

  const value = match[1];
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

export default function () {
  const meRes = taggedGet(ROUTES.me, 'GET /api/user/me', { headers: AUTH_HEADERS });
  check(meRes, {
    'GET /api/user/me -> 200': (r) => r.status === 200,
    'user has telegramId': (r) => {
      try {
        return JSON.parse(r.body)?.user?.telegramId != null;
      } catch {
        return false;
      }
    },
  });
  sleep(1);

  const checkInRes = taggedGet(ROUTES.checkInStatus, 'GET /api/dailyCheckIn/status', {
    headers: AUTH_HEADERS,
  });
  check(checkInRes, {
    'GET /api/dailyCheckIn/status -> 200': (r) => r.status === 200,
  });
  sleep(1);

  const leaderboardRes = taggedGet(ROUTES.leaderboard(1), 'GET /api/leaderboard/by-level/1', {
    headers: AUTH_HEADERS,
  });
  check(leaderboardRes, {
    'GET /api/leaderboard/by-level/1 -> 200': (r) => r.status === 200,
    'leaderboard has users array': (r) => {
      try {
        return Array.isArray(JSON.parse(r.body)?.users);
      } catch {
        return false;
      }
    },
  });
  sleep(1);

  const catalogRes = taggedGet(ROUTES.gamesCatalog, 'GET /api/games/catalog', {
    headers: AUTH_HEADERS,
  });
  check(catalogRes, {
    'GET /api/games/catalog -> 200': (r) => r.status === 200,
    'catalog has games': (r) => {
      try {
        return JSON.parse(r.body)?.games?.length > 0;
      } catch {
        return false;
      }
    },
  });
  sleep(1);

  const taskDefsRes = taggedGet(ROUTES.taskDefs, 'GET /api/tasks/definitions', {
    headers: AUTH_HEADERS,
  });
  check(taskDefsRes, {
    'GET /api/tasks/definitions -> 200': (r) => r.status === 200,
  });
  sleep(1);

  const inviteRes = taggedGet(ROUTES.inviteProgress, 'GET /api/invite/progress', {
    headers: AUTH_HEADERS,
  });
  check(inviteRes, {
    'GET /api/invite/progress -> 200': (r) => r.status === 200,
    'invite has invitedCount': (r) => {
      try {
        return JSON.parse(r.body)?.invitedCount != null;
      } catch {
        return false;
      }
    },
  });
  sleep(1);

  const cssRes = taggedGet(ROUTES.staticCSS, 'GET /styles.css', {
    headers: {
      'Accept-Encoding': 'gzip',
    },
  });
  check(cssRes, {
    'GET /styles.css -> 200': (r) => r.status === 200,
    'styles.css has Content-Encoding (compression active)': (r) =>
      getHeaderValue(r, 'Content-Encoding').toLowerCase().includes('gzip'),
    'styles.css has ETag header': (r) => Boolean(getHeaderValue(r, 'ETag')),
  });
  sleep(2);
}
