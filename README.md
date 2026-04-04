# Hope Backend

Node.js/Express backend for the Hope Telegram mini app.

## 1. Current Feature Scope

- Telegram `initData` authentication + JWT cookie sessions
- User profile, wallet linking, leaderboard, referrals
- Mining (6-hour cycle)
- Daily check-in with on-chain payment verification
- Games Engine (`flipcards`, `mystery-box`, plus coming-soon plugins)
- Ticket exchange (free in-app conversion)
- Weekly drop eligibility and entry
- Admin operations and reward tooling
- Socket.IO live sync for user and leaderboard updates

## 2. Quick Start

```bash
cd hope-backend
npm install
node app.js
```

Dev watch mode:

```bash
node --watch app.js
```

## 3. Environment Variables

Required core variables:

- `MONGODB_URI`
- `BOT_TOKEN`
- `JWT_SECRET`
- `DEV_WALLET_ADDRESS` (or `TON_WALLET_ADDRESS`)

Common optional variables:

- `PORT` (default `3000`)
- `NODE_ENV`
- `REDIS_URL` (default `redis://localhost:6379`)
- `WS_MAX_BUFFER_MB` (default `5`)
- `CLUSTER_WORKERS` (used by PM2 cluster mode)
- `ALLOWED_ORIGINS`
- `COOKIE_SAMESITE`
- `ADMIN_TELEGRAM_IDS`
- `TELEGRAM_AUTH_MAX_AGE_SEC`
- `TELEGRAM_FUTURE_SKEW_SEC`
- `API_AUTH_EXISTS_CACHE_TTL_MS`
- `RATE_LIMIT_EXEMPT_IPS`
- `TON_API_URL`
- `TON_PRICE_STALE_TTL_MS`
- `FLIPCARDS_PASS_USD`
- `CURRENT_CONTEST_WEEK`
- `ENABLE_TELEGRAM_NOTIFICATIONS`

## 4. Runtime Architecture

Entry file:

- `app.js`

Main layers:

- `routes/*` for HTTP endpoints
- `middleware/*` for auth and limits
- `services/games/*` for plugin-based game engine
- `utils/*` for TON verification, rewards, scheduler, and shared logic
- `models/*` for MongoDB documents

## 5. Auth and Security

- Telegram signature verification uses HMAC-SHA256 with `BOT_TOKEN`.
- JWT is issued after auth (`expiresIn: 7d`).
- JWT cookie is httpOnly; `secure`/`sameSite` depend on runtime context.
- `apiAuth` verifies token and confirms user existence (with short TTL cache).
- Wallet save endpoint enforces TON mainnet and unique wallet constraint.

## 6. Rate Limits and Cooldowns

- Auth routes: `10 / 15min`
- General API routes: `100 / 15min` in production
- Game routes: `500 / 15min` in production, keyed by telegramId
- Game move cooldown: `300ms` minimum between move calls

## 7. Transaction Verification Matrix

Server-side TON verification required:

- Daily check-in (`/api/dailyCheckIn/verify`)
- Mystery box purchase (`/api/mysteryBox/purchase`)
- Flipcards pass purchase (`/api/games/flipcards/purchase`)
- Weekly drop entry (`/api/weeklyDrop/enter`)

No TON verification required:

- Ticket exchange (`/api/exchangeTickets`) is free in-app conversion

## 8. Key Route Groups

Public:

- `POST /api/auth/telegram`
- `POST /api/web-auth/register`
- `POST /api/web-auth/login`

Authenticated core:

- `/api/me`
- `/api/user/*`
- `/api/mining/*`
- `/api/dailyCheckIn/*`
- `/api/tasks/*`
- `/api/invite/*`
- `/api/exchangeTickets`
- `/api/mysteryBox/*`
- `/api/boxes/*`
- `/api/games/*`
- `/api/leaderboard/*`
- `/api/weeklyDrop/*`
- `/api/transactions/*`
- `/api/tonAmount/*`

Admin:

- `/api/admin/*`
- `/api/rewards/*`

## 9. Related Docs

- [API_REFERENCE.md](./API_REFERENCE.md)
- [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)
- [GAMES_ENGINE.md](./GAMES_ENGINE.md)

