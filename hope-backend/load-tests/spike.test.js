// load-tests/spike.test.js
// Spike test that simulates sudden viral traffic.
// Run after smoke and stress tests pass.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { AUTH_HEADERS, ROUTES } from './config.js';

export let options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '30s', target: 200 },
    { duration: '1m', target: 200 },
    { duration: '30s', target: 500 },
    { duration: '1m', target: 500 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    // Global thresholds
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.10'],

    // Per-endpoint thresholds (using request tags)
    'http_req_duration{endpoint:GET /api/user/me}': ['p(95)<3000'],
    'http_req_duration{endpoint:GET /api/leaderboard/by-level/:level}': ['p(95)<3000'],
    'http_req_failed{endpoint:GET /api/user/me}': ['rate<0.10'],
    'http_req_failed{endpoint:GET /api/leaderboard/by-level/:level}': ['rate<0.10'],
  },
};

export default function () {
  // 60/40 split: profile and leaderboard traffic.
  const roll = Math.random();

  if (roll < 0.6) {
    const meRes = http.get(ROUTES.me, {
      headers: AUTH_HEADERS,
      tags: { endpoint: 'GET /api/user/me' },
    });

    check(meRes, {
      'spike profile: survived (not 500)': (r) => r.status !== 500,
    });

    sleep(1);
    return;
  }

  const level = Math.floor(Math.random() * 3) + 1;
  const lbRes = http.get(ROUTES.leaderboard(level), {
    headers: AUTH_HEADERS,
    tags: { endpoint: 'GET /api/leaderboard/by-level/:level' },
  });

  check(lbRes, {
    'spike leaderboard: survived (not 500)': (r) => r.status !== 500,
  });

  sleep(1);
}
