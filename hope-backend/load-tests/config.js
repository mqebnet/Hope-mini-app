// load-tests/config.js
// -----------------------------------------------------------------------------
// Shared k6 configuration for all Hope Universe load tests.
//
// Usage:
//   k6 run --env BASE_URL=http://localhost:3000 --env TEST_JWT=your_token smoke.test.js
//
// Or set TEST_JWT directly in this file for local runs (do not commit a real token).
// -----------------------------------------------------------------------------

export const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:3000';

// Get a real JWT by:
//   1. Opening your app in Telegram
//   2. Opening DevTools -> Application -> Cookies -> copy the `jwt` value
//   3. Paste it below, or pass via --env TEST_JWT=...
//
// NOTE: RATE_LIMIT_EXEMPT_IPS is IP-based, not telegramId-based.
// Add your load-test machine IPs in .env so rate limiting doesn't block requests:
//   RATE_LIMIT_EXEMPT_IPS=127.0.0.1,::1,::ffff:127.0.0.1
export const TEST_JWT = __ENV.TEST_JWT || 'PASTE_YOUR_JWT_HERE';

export const AUTH_HEADERS = {
  'Content-Type': 'application/json',
  Cookie: `jwt=${TEST_JWT}`,
};

// -- Thresholds - pass/fail criteria ------------------------------------------
// These are realistic targets for a single-process Node.js app on a VPS.
// Tighten p(95) to <200ms once you're on production hardware.
export const THRESHOLDS = {
  // 95% of requests must complete under 500ms
  // 99% must complete under 1.5s
  http_req_duration: ['p(95)<500', 'p(99)<1500'],

  // Less than 1% of requests should fail
  // NOTE: 429 (rate limit) responses DO count as failures in k6 by default.
  // If rate limiting fires during a test, either:
  //   a) Add your IP to RATE_LIMIT_EXEMPT_IPS in .env, or
  //   b) Raise this threshold to rate<0.05 while testing limits
  http_req_failed: ['rate<0.01'],
};

// -- Route map - all correct routes in this app --------------------------------
// Reference when writing test scenarios to avoid hitting wrong endpoints.
export const ROUTES = {
  me: `${BASE_URL}/api/user/me`,
  checkInStatus: `${BASE_URL}/api/dailyCheckIn/status`,
  miningStart: `${BASE_URL}/api/mining/start`,
  miningClaim: `${BASE_URL}/api/mining/claim`,
  leaderboard: (level) => `${BASE_URL}/api/leaderboard/by-level/${level}`,
  taskDefs: `${BASE_URL}/api/tasks/definitions`,
  taskPending: `${BASE_URL}/api/tasks/pending-verifications`,
  inviteProgress: `${BASE_URL}/api/invite/progress`,
  inviteLink: `${BASE_URL}/api/invite/link`,
  gamesCatalog: `${BASE_URL}/api/games/catalog`,
  gameStart: (gameId) => `${BASE_URL}/api/games/${gameId}/start`,
  gameMove: (gameId) => `${BASE_URL}/api/games/${gameId}/move`,
  gameComplete: (gameId) => `${BASE_URL}/api/games/${gameId}/complete`,
  gameSession: (gameId, gameSessionId) => `${BASE_URL}/api/games/${gameId}/session/${gameSessionId}`,
  gameStatus: (gameId) => `${BASE_URL}/api/games/${gameId}/status`,
  flipcardsStart: `${BASE_URL}/api/games/flipcards/start`,
  flipcardsMove: `${BASE_URL}/api/games/flipcards/move`,
  flipcardsComplete: `${BASE_URL}/api/games/flipcards/complete`,
  staticCSS: `${BASE_URL}/styles.css`,
};
