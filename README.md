# Hope Backend API

A comprehensive Node.js/Express backend for the **Hope Telegram Mini App** — a gamified crypto platform featuring mining, ticket systems, daily check-ins, referrals, and TON blockchain integration.

## Table of Contents

- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Environment Configuration](#environment-configuration)
- [Database Models](#database-models)
- [API Endpoints](#api-endpoints)
- [Core Utilities](#core-utilities)
- [Authentication & Security](#authentication--security)
- [Transaction Verification](#transaction-verification)
- [Development & Testing](#development--testing)
- [Deployment](#deployment)

---

## Quick Start

### Prerequisites
- **Node.js** 16+
- **MongoDB** (local or Atlas connection string)
- **Telegram Bot Token** (for auth verification)
- **TON API key** (for transaction verification; uses tonapi.io by default)

### Installation

```bash
cd hope-backend
npm install
```

### Environment Setup

Create a `.env` file in the root with:

```env
# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/hope

# Server
PORT=3000
NODE_ENV=development

# Telegram Bot
BOT_TOKEN=your_bot_token_here
ADMIN_TELEGRAM_IDS=123456789,987654321

# JWT
JWT_SECRET=your_secret_key_min_32_chars_long_here

# TON Blockchain
DEV_WALLET_ADDRESS=UQBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TON_API_URL=https://tonapi.io/v2
TON_PRICE_STALE_TTL_MS=1800000  # 30 min fallback

# CORS & Security
ALLOWED_ORIGINS=https://t.me,http://localhost:5173
COOKIE_SAMESITE=none  # For Telegram WebView

# Features
REQUIRE_EXCHANGE_PAYMENT=true
TELEGRAM_AUTH_MAX_AGE_SEC=86400
TELEGRAM_FUTURE_SKEW_SEC=300

# Email (optional, for screenshot/result notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@yourapp.com
SMTP_PASS=app_password
ADMIN_EMAIL=admin@yourapp.com
```

### Run Development Server

```bash
npm start
```

Server listens on `http://localhost:3000` by default.

---

## Project Structure

```
hope-backend/
├── models/               # Mongoose schemas
│   ├── User.js          # User profile, tickets, mining, check-ins
│   ├── Contestant.js    # Weekly contest entries
│   └── KeyValue.js      # Config store (task catalog, contest week, etc.)
├── routes/              # API endpoint handlers
│   ├── auth.js          # Telegram & JWT authentication
│   ├── user.js          # User profile & status
│   ├── mining.js        # 6-hour mining sessions
│   ├── dailyCheckIn.js  # Check-in with transaction verification
│   ├── tasks.js         # Daily & one-time tasks
│   ├── invite.js        # Referral system and rewards
│   ├── mysteryBox.js    # Puzzle boxes, purchase, solve, claim
│   ├── puzzles.js       # Puzzle verification hooks
│   ├── exchangeTickets.js    # Ticket trading (Bronze→Silver→Gold)
│   ├── leaderboard.js   # XP/points rankings per level
│   ├── weeklyDrop.js    # Contest eligibility & entry
│   ├── tonAmount.js     # USD→TON price conversion
│   ├── tonConnect.js    # Wallet connection (legacy/minimal)
│   ├── rewards.js       # Admin reward distribution
│   ├── transactions.js  # Transaction history
│   ├── referral.js      # Referral progress endpoint
│   ├── admin.js         # Admin management panel
│   └── me.js            # Authenticated user endpoint
├── middleware/          # Express middleware
│   ├── apiAuth.js       # JWT verification for /api/* routes
│   ├── pageAuth.js      # Page-level auth checks
│   └── adminAuth.js     # Admin-only gate
├── utils/               # Shared utilities
│   ├── tonHandler.js    # TON transaction verification & resolution
│   ├── priceHandler.js  # TON/USDT price caching & conversion
│   ├── levelUtil.js     # Level thresholds & calculations
│   ├── dailyCheckIn.js  # Streak, calendar, reward logic
│   ├── inviteCode.js    # Unique code generation
│   ├── taskCatalog.js   # Task definitions storage
│   ├── contestWeek.js   # Contest week management
│   ├── telegramNotifier.js  # Telegram notifications (admin)
│   └── notificationScheduler.js # Cron jobs (mining reminders)
├── public/              # Static frontend assets
├── server.js            # Express app setup
├── package.json         # Dependencies
└── .env                 # Environment variables (not in git)
```

---

## Environment Configuration

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `MONGODB_URI` | string | ❌ required | MongoDB connection string |
| `BOT_TOKEN` | string | ❌ required | Telegram bot token for auth signature verification |
| `JWT_SECRET` | string | ❌ required | Secret for JWT signing (min 32 chars recommended) |
| `DEV_WALLET_ADDRESS` | string | ❌ required | Developer's TON wallet for receiving transactions |
| `PORT` | number | `3000` | Server port |
| `NODE_ENV` | string | `development` | Environment mode |
| `ADMIN_TELEGRAM_IDS` | string | `` | Comma-separated admin user IDs for `/admin` access |
| `ALLOWED_ORIGINS` | string | `` | Comma-separated CORS origins; empty = allow all |
| `COOKIE_SAMESITE` | string | `lax` | Cookie SameSite policy (`strict`, `lax`, `none`) |
| `TON_API_URL` | string | `https://tonapi.io/v2` | TON blockchain API endpoint |
| `TON_PRICE_STALE_TTL_MS` | number | `1800000` | Fallback cache TTL if price fetch fails |
| `REQUIRE_EXCHANGE_PAYMENT` | string | `true` | Require TON payment for ticket exchanges |
| `TELEGRAM_AUTH_MAX_AGE_SEC` | number | `86400` | Max age of Telegram initData signature (1 day) |
| `TELEGRAM_FUTURE_SKEW_SEC` | number | `300` | Allow clock skew for auth timestamps (5 min) |
| `CURRENT_CONTEST_WEEK` | string | `Week 1` | Active contest week identifier |

---

## Database Models

### User

Main profile schema. Tracks account state, rewards, activities.

```javascript
{
  telegramId: Number,              // Primary identifier
  username: String,                // @username or fallback
  points: Number,                  // Accumulated points
  level: String,                   // "Seeker" → "Eldrin"
  xp: Number,                      // Experience points
  streak: Number,                  // Consecutive daily check-ins
  badges: [String],                // ["perfect-streak-10", ...]
  wallet: String,                  // Connected TON wallet address
  transactions: [{                 // Verified on-chain transactions
    txHash, purpose, expectedUsd, amountTon, status, createdAt
  }],
  completedTasks: [String],        // Task IDs completed
  bronzeTickets: Number,           // Ticket balances
  silverTickets: Number,
  goldTickets: Number,
  checkIns: [{dayKey, txHash, verified, createdAt}], // Daily history
  miningStartedAt: Date,           // Active mining session
  inviteCode: String,              // Unique referral code
  invitedCount: Number,            // Successful referrals count
  mysteryBoxes: [MysteryBoxSchema], // Purchase/solve history
  isAdmin: Boolean,                // Admin flag
  createdAt: Date,
  updatedAt: Date
}
```

### Contestant

Weekly drop contest entry.

```javascript
{
  telegramId: Number,              // User ID
  wallet: String,                  // Associated wallet
  week: String,                    // Week identifier (e.g., "Week 1")
  enteredAt: Date,                 // Entry timestamp
  txHash: String                   // Entry transaction hash
}
```

### KeyValue

Generic key-value config store for dynamic settings.

```javascript
{
  key: String,                     // Unique config key
  value: Mixed                     // JSON-serializable value
  updatedAt: Date
}
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/auth/telegram` | ❌ | Verify initData, create JWT |
| `POST` | `/api/auth/debug-log` | ❌ | Dev-only: log client messages |

### User Profile

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/user/me` | ✅ | Get authenticated user profile |
| `GET` | `/api/me` | ✅ | Alias for `/api/user/me` |

### Mining

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/mining/start` | ✅ | Start 6-hour mining session |
| `POST` | `/api/mining/claim` | ✅ | Claim 250 points after 6 hours |

### Daily Check-In

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/dailyCheckIn/status` | ✅ | Get streak, calendar, reset time |
| `POST` | `/api/dailyCheckIn/verify` | ✅ | Verify check-in payment & award |
| `GET` | `/api/tasks/daily-checkin` | ✅ | Alternative check-in endpoint |
| `POST` | `/api/tasks/daily-checkin` | ✅ | Verify & claim (tasks-namespaced) |

### Tasks

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/tasks/definitions` | ✅ | Get task catalog (daily + one-time) |
| `POST` | `/api/tasks/complete` | ✅ | Claim basic task (no proof) |
| `POST` | `/api/tasks/verify-proof` | ✅ | Upload screenshot for verification |

### Referral/Invite

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/invite/link` | ✅ | Get user's personal invite link |
| `GET` | `/api/invite/progress` | ✅ | Get referral milestone progress |
| `GET` | `/api/invite/verify` | ✅ | Check if milestone reached (query: `?target=1`) |
| `POST` | `/api/invite/claim` | ✅ | Claim milestone reward (query: `?target=3`) |
| `POST` | `/api/invite/register` | ✅ | Register new user via invite code |
| `GET` | `/api/invite/top-referrers` | ✅ | Top 50 referrers leaderboard |

### Marketplace

#### Ticket Exchange
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/exchangeTickets` | ✅ | Trade Bronze→Silver or Silver→Gold (fee: $0.1) |

#### Mystery Box & Puzzle
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/mysteryBox/status` | ✅ | Get today's boxes & active puzzle |
| `GET` | `/api/mysteryBox/dev/today` | ✅ | Dev-only: inspect boxes with solution |
| `POST` | `/api/mysteryBox/purchase` | ✅ | Buy mystery box (in-order; fee: $0.1) |
| `POST` | `/api/mysteryBox/open` | ✅ | Open box & generate puzzle |
| `POST` | `/api/mysteryBox/solve` | ✅ | Submit puzzle piece arrangement |
| `POST` | `/api/mysteryBox/claim` | ✅ | Claim rewards on successful solve |
| `POST` | `/api/puzzles/verify` | ✅ | Record puzzle completion |

### Leaderboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/leaderboard/by-level/:levelIndex` | ✅ | Top 100 users for level (1–10) |
| `GET` | `/api/leaderboard/rank/:userId` | ✅ | Get user's rank on their level ⚠️ **not yet implemented** |

### Weekly Drop Contest

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/weeklyDrop/eligibility` | ✅ | Check if user meets all 3 conditions |
| `POST` | `/api/weeklyDrop/enter` | ✅ | Register for contest (deduct 10 Gold + fee: $0.5) |

### TON Integration

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/tonAmount/ton-amount` | ✅ | Get TON equivalent for USD (query: `?usd=0.3`) |
| `GET` | `/api/tonConnect/connect` | ✅ | Get TON Connect URL (legacy) |
| `GET` | `/api/tonConnect/status` | ✅ | Check wallet connection status (legacy) |

### Rewards (Admin)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/rewards/points` | ✅ | Admin: Award points to user |
| `POST` | `/api/rewards/tickets` | ✅ | Admin: Award tickets to user |

### Admin Dashboard

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/admin/stats` | ✅🔒 | Overall app stats |
| `GET` | `/api/admin/users` | ✅🔒 | Paginated user list with search |
| `PATCH` | `/api/admin/users/:telegramId` | ✅🔒 | Edit user props manually |
| `GET` | `/api/admin/tasks` | ✅🔒 | Get task catalog |
| `PUT` | `/api/admin/tasks` | ✅🔒 | Update task definitions |
| `GET` | `/api/admin/contests/overview` | ✅🔒 | Contest entries & results |
| `POST` | `/api/admin/contests/set-week` | ✅🔒 | Change active contest week |
| `POST` | `/api/admin/contests/results` | ✅🔒 | Publish contest winners |
| `POST` | `/api/admin/mining-reminders` | ✅🔒 | Send mining reminders via Telegram |

**Legend:** ✅ = authenticated, 🔒 = admin-only

---

## Core Utilities

### tonHandler.js

Handles TON blockchain transaction verification with retry logic.

**Key Functions:**
- `verifyTransaction({telegramId, txHash, txBoc, purpose, requiredUsd, minConfirmations})` — Verify on-chain payment meets amount & recipient requirements. Returns `{ok, reason, txRef}`.
- `resolveTransactionWithRetry({txHash, txBoc, timeoutMs, intervalMs})` — Poll TON API until tx appears or timeout.
- `fetchTransaction(txHash)` — Fetch single transaction from TON API.

**Feature:** BOC (Bag of Cells) support for browsers that only have encoded transaction, not hash.

### priceHandler.js

Singleton cache manager for TON/USDT price.

**Key Methods:**
- `getTonPriceUSDT(options)` — Get current TON price; fetches from Coingecko → Binance → stale cache.
- `usdtToTon(usdtAmount, options)` — Convert USDT to TON equivalent.

**Cache:** In-memory with persistence to MongoDB (KeyValue model) for recovery on restart.

### levelUtil.js

Utility for determining user level from points.

**Levels (10 total):** Seeker → Dreamer → Believer → Challenger → Navigator → Ascender → Master → Grandmaster → Legend → Eldrin

**Functions:**
- `getUserLevel(points)` — Return level name for a point total.
- `getNextLevelThreshold(points)` — Return next level's point requirement.

### dailyCheckIn.js

Core logic for daily check-in system: streaks, calendar, rewards, perfect badge.

**Key Functions:**
- `getCheckInDayKey(date)` — Get UTC day key (YYYY-MM-DD) normalized to 00:02 UTC reset.
- `normalizeStreakIfMissed(user, now)` — Reset streak to 0 if user missed a day.
- `applyVerifiedDailyCheckIn(user, txHash, now)` — Apply full reward set & update streak/badge.
- `buildCheckInCalendar(user, now, days)` — Generate 14-day history with status per day.

**Rewards:** 
- 1,000 points
- 100 Bronze tickets
- 5 XP
- Perfect Streak badge at 10 consecutive days

### inviteCode.js

Generate unique random invite codes (hex).

**Function:**
- `generateUniqueInviteCode()` — Async; checks DB for collision, retries until unique.

### taskCatalog.js

Manage dynamic task definitions (daily, one-time) stored in KeyValue.

**Functions:**
- `getTaskCatalog()` — Fetch current catalog.
- `setTaskCatalog({daily, oneTime})` — Update catalog.

### contestWeek.js

Manage contest week identifier for contests.

**Function:**
- `getCurrentContestWeek()` — Get active week from KeyValue or env var.

### notificationScheduler.js

Telegram notifications via node-cron.

**Scheduled Jobs:**
- Mining reminders (hourly)
- Weekly contest email report (Mondays)

### telegramNotifier.js

Send bulk Telegram messages to users via bot.

**Function:**
- `sendBulkTelegramMessage(userIds, message)` — Send message to list of users.

---

## Authentication & Security

### JWT Flow

1. Client calls `POST /api/auth/telegram` with initData from Telegram WebApp.
2. Server verifies HMAC-SHA256 signature using BOT_TOKEN.
3. On success, server issues JWT (7-day expiry) via httpOnly cookie.
4. Subsequent API calls auto-include JWT via cookie; middleware validates.

### Authorization

- **Public routes:** `/auth`, `/api/auth/`
- **Authenticated:** All `/api/*` routes require valid JWT
- **Admin-only:** Routes under `/api/admin/*` require JWT + `isAdmin: true`

### Security Headers

- `Cache-Control: no-store` on API responses
- `httpOnly, Secure, SameSite=none` cookies (for Telegram WebView)
- Rate limit: 100 requests/15 min per IP on `/api/`

### Transaction Verification

**All paid actions** (check-in, mystery box, exchange, contest) require:
1. Client submits `txHash` or `txBoc` (transaction proof).
2. Backend queries TON API to confirm:
   - Transaction exists & is confirmed.
   - Recipient wallet matches `DEV_WALLET_ADDRESS`.
   - Amount ≥ required USD equivalent in TON.
3. Mark transaction as `verified` in user's transaction log.
4. Only then credit rewards.

---

## Development & Testing

### Running Locally

```bash
npm start
```

Server logs requests and errors to console. Check MongoDB compass or mongosh for data.

### Environment Modes

- **Development** (`NODE_ENV=development`):
  - Auth timestamps allow future skew.
  - Debug logs enabled.
  - Admin restrictions may be relaxed for testing.

- **Production** (`NODE_ENV=production`):
  - Strict auth validation.
  - Cache-busting on static assets.
  - Rate limiting enforced.

### Testing Checklist (Manual)

- [ ] Auth: Log in via Telegram, verify JWT in cookies.
- [ ] Mining: Start → wait/advance time → claim.
- [ ] Daily check-in: Send fake tx proof, verify streak.
- [ ] Mystery box: Purchase → open → solve puzzle → claim.
- [ ] Leaderboard: Verify top-100 sorting (XP then points).
- [ ] Referral: Generate link, register new user, check bonus.
- [ ] Admin: Update users, tasks, contest week.

### Unit/Integration Tests (TODO)

Use Jest + Supertest for API tests. Examples:
```javascript
test('POST /api/mining/claim succeeds after 6 hours', async () => { ... });
test('POST /api/dailyCheckIn/verify rejects unverified tx', async () => { ... });
test('POST /api/mysteryBox/solve validates piece arrangement', async () => { ... });
```

---

## Deployment

### Prerequisites

- MongoDB Atlas cluster (or self-hosted Mongo replica set)
- Node.js 16+ runtime (e.g., AWS Lambda, Heroku, Railway, Render)
- Telegram bot token
- TON wallet address
- Environment variables configured

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Build & push to container registry.

### Environment Checklist

Before deploying:
- [ ] `MONGODB_URI` → production cluster
- [ ] `BOT_TOKEN` → live bot (not test)
- [ ] `DEV_WALLET_ADDRESS` → mainnet wallet
- [ ] `JWT_SECRET` → long random string
- [ ] `NODE_ENV=production`
- [ ] `ALLOWED_ORIGINS` → production domain + Telegram WebView origin
- [ ] `TON_API_URL` → mainnet endpoint (already correct)

### Post-Deployment

1. Test `/api/auth/telegram` endpoint with real Telegram initData.
2. Verify TON transaction verification works against mainnet.
3. Monitor logs for errors & performance.
4. Run admin checks via `/api/admin/stats`.

---

## Troubleshooting

### MongoDB Connection Error

```
Error: connect ECONNREFUSED
```
- Check `MONGODB_URI` in `.env`.
- Ensure MongoDB is running (locally) or Atlas cluster is accessible.
- Verify IP whitelist if using Atlas.

### TON API Timeouts

```
TON fetch failed: timeout
```
- Check `TON_API_URL` is correct.
- Rate limiting via tonapi.io? Add exponential backoff.
- Falls back to stale cache if `allowStale: true`.

### JWT Invalid / Auth Failing

```
401 Unauthorized
```
- Verify `JWT_SECRET` is consistent.
- Check cookie is being sent (browser dev tools → Application → Cookies).
- Ensure `COOKIE_SAMESITE` matches Telegram WebView policy.

### Missing Environment Variable

```
Error: BOT_TOKEN is not defined
```
- Add the var to `.env`.
- Restart server: `npm start`.

---

## Contributing

- Follow existing code style (use ESLint if available).
- Add JSDoc comments to new utilities.
- Write tests for critical paths.
- Update this README for new endpoints or major changes.

---

## License

See root `package.json` or projects LICENSE file.

---

**Last Updated:** March 2026  
**Backend Version:** 2.0.0  
**PRD Alignment:** Hope PRD v2.0
