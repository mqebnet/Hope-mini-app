# Load Test Profiles

These presets use `autocannon` against real HOPE routes so we can measure practical capacity on your machine or server.

## Important

- Run against `localhost` or your server IP, not `ngrok`.
- Run with the same topology you expect in production: PM2 cluster, Redis on, Mongo on.
- For authenticated scenarios, supply a valid session cookie from a real login.

## Quick Start

Windows PowerShell:

```powershell
$env:LOAD_BASE_URL = "http://127.0.0.1:3000"
$env:LOAD_COOKIE = "token=YOUR_COOKIE_VALUE"
node tests/load/run-autocannon.js user-me
```

Linux/macOS:

```bash
LOAD_BASE_URL=http://127.0.0.1:3000 \
LOAD_COOKIE="token=YOUR_COOKIE_VALUE" \
node tests/load/run-autocannon.js user-me
```

## Scenarios

- `auth`: public auth page warm-up
- `user-me`: authenticated `GET /api/user/me`
- `leaderboard`: authenticated `GET /api/leaderboard/by-level/1`
- `mining-start`: authenticated `POST /api/mining/start`

## Suggested Ramp

Run each scenario in steps and record:

- requests/sec
- p95 latency
- non-2xx responses
- app CPU and memory
- Mongo CPU / slow queries
- Redis memory / ops

Example sequence:

```powershell
node tests/load/run-autocannon.js auth
node tests/load/run-autocannon.js user-me
node tests/load/run-autocannon.js leaderboard
node tests/load/run-autocannon.js mining-start
```

## Safe Capacity Rule

Treat the highest stable level as your safe capacity only when:

- error rate stays under `1%`
- p95 stays under about `500ms` for reads
- CPU stays under about `70-75%`
- memory does not climb continuously
