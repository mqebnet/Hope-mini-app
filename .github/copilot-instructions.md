# Hope Mini-App: Copilot Instructions

**Overview:** Hope is a gamified Telegram Mini App with a backend Node.js/Express server, MongoDB database, and vanilla JavaScript frontend. Users earn points, tickets, and XP through mining, contests, tasks, and daily check-ins integrated with TON blockchain for real transactions.

---

## Architecture Overview

### Technology Stack
- **Frontend:** Vanilla HTML/CSS/JavaScript (single-page app with tab navigation, no framework)
- **Backend:** Express.js server
- **Database:** MongoDB (Mongoose ODM)
- **Blockchain:** TON via tonapi.io, @ton/ton, @tonconnect/ui
- **Auth:** Telegram `initData` HMAC-SHA256 verification + JWT tokens
- **Scheduling:** node-cron for weekly contests and daily resets
- **Notifications:** Telegram Bot API, Nodemailer for emails

### Core Data Model
- **User:** Points, XP, level, streak, tickets (bronze/silver/gold), mining sessions, transaction history
- **Transactions:** TON payments tracked by hash/BOC with purpose, status (pending/verified/failed), USD amount
- **Tickets:** Earned via tasks and check-ins; exchangeable across tiers with TON fees
- **Mystery Boxes:** Purchased with tickets; contain jigsaw puzzles with meme images
- **Referrals:** Invite system with milestone rewards; tracked via unique invite codes
- **Contests:** Weekly drop events with entries stored in `Contestant` model

---

## Critical Workflows

### 1. Authentication Flow (Telegram → JWT)
**Files:** `routes/auth.js`, `middleware/apiAuth.js`

- User sends Telegram `initData` (from Telegram WebApp SDK)
- Backend verifies HMAC-SHA256 hash using `BOT_TOKEN`
- Create or find User by `telegramId` (unique index)
- Generate JWT token; set HTTP-only, Secure cookie with SameSite handling
- **Pattern:** Verify `auth_date` is within `TELEGRAM_AUTH_MAX_AGE_SEC` (default 86400s) and future skew `TELEGRAM_FUTURE_SKEW_SEC` (300s)
- **Special handling:** Telegram WebView often needs `SameSite=None` in production

### 2. TON Transaction Verification (Payment Gateway)
**Files:** `utils/tonHandler.js`, `routes/dailyCheckIn.js`, `routes/exchangeTickets.js`

**Key Challenge:** TON API is eventually consistent; transactions may not appear immediately.

- **Main function:** `verifyTransaction({ txHash, txBoc, expectedUsd, recipientAddress, timeoutMs, intervalMs })`
- **Resolution:** Try explicit `txHash` first; if not found, extract message hash from BOC and search TON blockchain
- **Retry loop:** Poll tonapi.io every `intervalMs` (default 3s) up to `timeoutMs` (default 45s)
- **Validation:** Confirm recipient address (normalized), verify amount ≥ required USD (converted via `priceHandler.usdtToTon()`), check confirmations ≥ 1
- **Status tracking:** User model stores transaction with `status: 'pending'|'verified'|'failed'`
- **Pattern:** Always normalize TON addresses before comparison using `normalizeAddress()`

### 3. Daily Check-In Flow (Streak + Transaction)
**Files:** `routes/dailyCheckIn.js`, `utils/dailyCheckIn.js`

- User claims check-in: wallet sends TON payment, backend initiates verification (tx hash returned as promise)
- **Streak logic:** If user missed check-in yesterday, reset streak to 0 then increment to 1 (no carry-over)
- **Daily reset:** All users reset at UTC midnight (`getNextResetAtUtc()`); check-ins keyed by `dayKey` (ISO date string)
- **Middleware validation:** `normalizeStreakIfMissed(user, now)` called on every request to ensure streak is current
- **Fee:** Transaction amount sent to app wallet (`DEV_WALLET_ADDRESS`); user sees 0.1-0.3 USD equivalent required in UI

### 4. Puzzles & Mystery Boxes
**Files:** `routes/mysteryBox.js`, User model `puzzle` subdocument

- User purchases mystery box with tickets (bronze/silver/gold tier; different prices)
- Server picks random meme from catalog, generates jigsaw pieces (shuffled indices into `puzzle.pieces` array)
- **Frontend:** Handles puzzle UI and piece dragging; sends solution array (ordered piece IDs)
- **Backend verification:** Compare submitted solution against scrambled piece order; once solved, transition to `claimed` status
- **Reward:** Points/tickets awarded after verification

---

## Project Structure & Patterns

### Backend Organization
```
hope-backend/
├── server.js              # Express app setup, middleware chain, route mounting
├── package.json           # Dependencies: @ton/ton, mongoose, jsonwebtoken, node-cron, nodemailer
├── models/
│   ├── User.js           # Main schema: points, xp, level, tickets, transactions[], checkIns[], referrals[], mysteryBoxes[]
│   ├── Contestant.js     # Weekly contest entries; separate model for scalability
│   └── KeyValue.js       # Config store: taskCatalog, currentContestWeek, etc.
├── routes/
│   ├── auth.js           # POST /api/auth/telegram, /api/auth/logout
│   ├── user.js           # GET /api/user/me, /api/me (alias), profile data
│   ├── mining.js         # POST /api/mining/start, /api/mining/claim (6-hour sessions)
│   ├── dailyCheckIn.js   # POST /api/daily-check-in (TON payment + streak)
│   ├── tasks.js          # GET /api/tasks/list, POST /api/tasks/complete
│   ├── invite.js         # GET /api/invite/{code}, POST /api/invite/join, /api/invite/claim-milestone
│   ├── exchangeTickets.js # POST /api/exchange-tickets (tier conversion with fees)
│   ├── leaderboard.js    # GET /api/leaderboard (points-ranked top 50)
│   ├── weeklyDrop.js     # POST /api/weekly-drop/enter (contest entry)
│   ├── rewards.js        # GET /api/rewards/claimable (pending milestone rewards)
│   ├── tonConnect.js     # TON wallet connection helper endpoints
│   └── tonAmount.js      # Utility endpoint for USD ↔ TON conversion
├── middleware/
│   ├── apiAuth.js        # Validates JWT from cookies; sets req.user (telegramId)
│   ├── pageAuth.js       # Serves HTML pages with auth check (deprecated, mostly frontend now)
│   └── adminAuth.js      # Restricts endpoints to users in ADMIN_TELEGRAM_IDS
├── utils/
│   ├── tonHandler.js     # **Core TON verification logic**: resolveTransaction, verifyTransaction, priceHandler integration
│   ├── taskCatalog.js    # Task definitions; cached in KeyValue; hot-reload support
│   ├── dailyCheckIn.js   # Streak logic, dayKey generation, UTC reset times
│   ├── inviteCode.js     # Generate unique invite codes; collision detection
│   ├── levelUtil.js      # Calculate user level from points (thresholds: Seeker→Dreamer→Pioneer→Explorer→Legend→Sage)
│   ├── priceHandler.js   # Real-time USD ↔ TON conversion; cached with 30-min TTL fallback (TON_PRICE_STALE_TTL_MS)
│   ├── telegramNotifier.js # Send messages via Telegram Bot API; sendBulkTelegramMessage for contests
│   ├── notificationScheduler.js # node-cron jobs for weekly contests, daily resets
│   └── contestWeek.js    # Calculate current contest week ISO date
└── middleware/
```

### Frontend Organization (Vanilla JS)
```
hope-frontend/public/
├── index.html            # Main SPA shell with tab containers
├── auth.html             # Login flow (Telegram verification)
├── script.js             # Main app logic: tab routing, DOM updates, fetch() calls
├── styles.css            # Dark futuristic theme, responsive mobile-first
├── i18n.js               # Language switching logic; hardcoded i18n class with all translations
├── locales/              # i18n JSON files for supported languages: ar, en, fil, ms, ru, zh
├── profile.js            # User profile: stats, level, streak, invite code
├── leaderBoard.js        # Top 50 by points with rank and user avatars
├── tasks.js              # Task list; mark complete via POST /api/tasks/complete
├── invite.js             # Referral tab: share code, track referral count, claim milestones
├── marketPlace.js        # Buy mystery boxes and exchange tickets
├── weeklyDrop.js         # Enter weekly contest with fee per entry
├── connectWallet.js      # Tonkeeper and Telegram wallet integration via @tonconnect/ui
├── tonconnect.js         # Handle wallet connection callbacks
├── tonconnect-manifest.json # Required by TON Connect SDK (app metadata)
└── notify.js             # Toast notifications (top/bottom alerts)
```

---

## Key Conventions & Patterns

### Error Handling & Status Codes
- **400:** Bad request (validation error, missing fields)
- **401:** Unauthorized (JWT invalid/missing, auth header failed)
- **403:** Forbidden (user not admin when required)
- **404:** Not found (user/resource doesn't exist)
- **409:** Conflict (duplicate invite code, already completed task today, etc.)
- **500:** Server error (DB connection, TON API timeout, unexpected exception)
- **Pattern:** Always return `{ success: true/false, message?: string, user/data?: object }` in JSON

### Transaction Tracking Pattern
```javascript
// When initiating a TON payment:
const transaction = {
  txHash: hashFromWallet,
  purpose: 'dailyCheckIn' | 'exchangeTickets' | 'weeklyDropEntry' | etc.,
  taskId: 'optional_task_id',
  expectedUsd: 0.15,  // Required amount
  status: 'pending',
  createdAt: new Date()
};
user.transactions.push(transaction);
await user.save();

// Later, when verifying:
const verified = await verifyTransaction({
  txHash: transaction.txHash,
  expectedUsd: transaction.expectedUsd,
  recipientAddress: process.env.DEV_WALLET_ADDRESS,
  timeoutMs: 45000
});
if (verified) {
  transaction.status = 'verified';
  // Award points/tickets, unlock features
} else {
  transaction.status = 'failed';
  // Refund or retry UX
}
```

### User Level Calculation
**Files:** `utils/levelUtil.js`; called on every `/api/user/me` request.

```
Seeker:     0 points
Dreamer:    10,000 points
Pioneer:    25,000 points
Explorer:   50,000 points
Legend:     100,000 points
Sage:       250,000+ points
```

### Ticket Economy
- **Bronze tickets:** Earned from daily tasks (1–5 per task)
- **Silver tickets:** Higher-value tasks or challenge completions (10–50)
- **Gold tickets:** Limited sources (contests, special events, premium purchases)
- **Exchange fees:** Converting bronze → silver costs TON fee (~0.05 USD); silver → gold costs more (~0.15 USD)

### Middleware Chain Order in server.js
1. Trust proxy (`trust proxy`)
2. Request logging (console.log)
3. Database connection check
4. CORS setup
5. Cookie parser
6. JSON/URL parsing
7. Rate limiter (`express-rate-limit`: 100 requests per 15 min per IP)
8. Static file serving (with cache headers: `Cache-Control: no-store` for .js/.html/.css)
9. Route mounting

---

## Developer Workflows

### Running the Server
```bash
cd hope-backend
npm install
# Create .env file (see DEVELOPMENT_GUIDE.md for template)
npm start
# Server logs "Connected to MongoDB" and "Server running on http://localhost:3000"
```

### Testing an Endpoint (curl example)
```bash
# 1. Get JWT via Telegram auth
curl -X POST http://localhost:3000/api/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{"initData":"..."}'  # Paste real initData from Telegram SDK

# 2. Use JWT in subsequent requests
curl -H "Cookie: token=<JWT>" http://localhost:3000/api/user/me
```

### Database Inspection
- **Local MongoDB:** Use `mongosh` CLI or MongoDB Compass GUI
- **Atlas:** Connect via URI in `.env`; use Compass or Atlas UI
- **Common queries:**
  ```
  db.users.findOne({telegramId: 123456789})
  db.users.countDocuments()
  db.contestants.find({week: ISODate("2026-03-01")})
  ```

### Debugging TON Verification Issues
- **Enable verbose logging:** Search `tonHandler.js` for `console.error()` calls; they trace resolution steps
- **Check price stale:** If TON price is cached and old, conversion may fail; set `TON_PRICE_STALE_TTL_MS` shorter
- **Verify test wallet:** Send test transaction with `curl`, capture hash, then test `verifyTransaction()` with that hash
- **Timeout too short:** Increase `timeoutMs` parameter if TON API is slow (default 45s)

### Adding a New Task
1. **Update task catalog** in KeyValue model or `utils/taskCatalog.js`
2. **Define schema:** Task object with `id`, `title`, `reward`, `description`, `verification` logic
3. **Add verification route** in `routes/tasks.js` → POST handler checks conditions, calls `verifyTransaction()` if payment required
4. **Update frontend:** Add task to `tasks.js` UI; fetch list from `GET /api/tasks/list`
5. **Handle rewards:** After verification, increment user `points` and `xp`, save session

### Localization (i18n)
- **Language files:** JSON objects in `hope-frontend/public/locales/{lang}.json` (e.g., `en.json`, `ar.json`)
- **Frontend:** Translations hardcoded in `i18n.js` class constructor; swap language with language selector
- **Static serving:** Locale files also available as static assets at `/locales/{lang}.json` if needed
- **Pattern:** Use language codes like `en`, `ar`, `zh`, `fil`, `ru`, `ms`; default to English if locale missing

---

## External Dependencies & Integration Points

### Telegram WebApp SDK
- **In browser:** `window.Telegram.WebApp` provides `initData`, user context, haptic feedback
- **Auth header:** Frontend sends `initData` as JSON body to `POST /api/auth/telegram`
- **Limitations:** CORS policy; `telegram-init-data` custom header often required

### TON Blockchain Queries
- **API:** Default to `tonapi.io/v2` (set via `TON_API_URL` env var)
- **Endpoints used:** `/blockchain/accounts/{address}/transactions`, `/blockchain/messages/{hash}`, `/blockchain/messages/{hash}/transaction`
- **Retry logic:** `resolveTransactionWithRetry()` polls every 3s for up to 45s if tx not found immediately
- **Price conversion:** Cached USD ↔ TON rate; fallback to stale price if API slow

### Telegram Bot Notifications
- **Enabled:** Set `BOT_TOKEN` env var
- **Functions:** `sendTelegramMessage(telegramId, text)`, `sendBulkTelegramMessage(telegramIds, text, extra)`
- **Use cases:** Contest results, referral rewards, admin alerts
- **Limitation:** Messages fail silently if user hasn't started bot; no queue retry

### MongoDB Connection
- **URI:** Must be set in `.env` as `MONGODB_URI`
- **Behavior:** Server exits immediately if connection fails (no fallback)
- **Models:** Mongoose auto-creates collections; indexes created on schema definition
- **Pattern:** User query must use `.findOne({telegramId})` to leverage unique index

---

## Security & Performance Notes

### Authentication Security
- **JWT secret:** Must be ≥32 characters; regenerate in production
- **Cookie flags:** `HttpOnly` prevents XSS; `Secure` enforces HTTPS in production; `SameSite` prevents CSRF
- **Telegram hash verification:** Verify all fields in `initData` against `BOT_TOKEN`; reject if out-of-date

### Rate Limiting
- **Global:** 100 requests per 15 minutes per IP on `/api/*` routes
- **No bypass:** Rate limit applies to all users; must tune if needed for high-traffic events

### TON Payment Validation
- **Always verify recipient address** against `DEV_WALLET_ADDRESS`; never trust user input
- **Check amount >= required** (with small 1e-6 TON tolerance for rounding)
- **Verify confirmations:** Default 1 confirmation; increase for high-value transactions
- **Handle eventual consistency:** TON may take seconds to minutes; timeout after 45s and prompt retry

### Database Indexes
- `User.telegramId`: Unique, required (all auth queries)
- `User.inviteCode`: Unique, required (referral lookups)
- `Contestant.contest_id`: For weekly contest queries
- `User.transactions[].txHash`: Tracked but not indexed (small documents)

---

## Common Tasks for AI Agents

1. **Fix streak reset bug:** Check `dailyCheckIn.js` normalizeStreakIfMissed logic; ensure dayKey comparison is UTC-consistent
2. **Add new reward milestone:** Update User schema `inviteClaims`, add route handler in `routes/rewards.js`, update frontend UI
3. **Modify ticket exchange fees:** Update fee constants in `routes/exchangeTickets.js`; recalculate via `priceHandler.usdtToTon()`
4. **Debug TON verification timeouts:** Enable console.error logs in `tonHandler.js`; increase `timeoutMs` or check tonapi.io status
5. **Add language support:** Create locale JSON file in `locales/{newLang}.json`; register in frontend i18n selector
6. **Optimize performance:** Add caching layer to `taskCatalog` or `priceHandler` if queries slow down; use Redis if scale needed

---

## Questions Before Implementing Changes?

- Is this a user-facing change (needs frontend + backend) or internal logic?
- Does the change involve TON transactions (verify transaction security first)?
- Should changes be localized (add keys to all locale JSON files)?
- Is the change tied to daily resets or weekly contests (check cron jobs in `notificationScheduler.js`)?
