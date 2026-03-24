# Hope API Reference

Quick reference guide for all backend endpoints. See [README.md](./README.md) for full documentation.

---

## Authentication Routes (`/api/auth`)

### POST `/api/auth/telegram`
Authenticate user via Telegram initData, issue JWT.

**Request:**
```json
{"initData": "query_id=...&user={...}&hash=...&..."}
```

**Response (Success 200):**
```json
{
  "success": true,
  "user": {
    "id": 123456789,
    "username": "user",
    "level": "Seeker",
    "points": 0,
    "xp": 0,
    "streak": 0,
    "badges": [],
    "bronzeTickets": 0,
    "silverTickets": 0,
    "goldTickets": 0,
    "isAdmin": false
  }
}
```

**Auth:** None (public)

---

## User Profile Routes (`/api/user`, `/api/me`)

### GET `/api/user/me` (alias: `/api/me`)
Get authenticated user's full profile.

**Request:** No body

**Response (200):**
```json
{
  "success": true,
  "user": {
    "telegramId": 123456789,
    "username": "user",
    "points": 1500,
    "level": "Dreamer",
    "xp": 25,
    "streak": 3,
    "badges": ["perfect-streak-10"],
    "bronzeTickets": 250,
    "silverTickets": 5,
    "goldTickets": 0,
    "checkIns": [{dayKey, txHash, verified, createdAt}],
    "checkedInToday": false,
    "miningStartedAt": "2026-03-04T10:00:00Z",
    "nextLevelAt": 100000,
    "dailyCheckInResetAtUtc": "2026-03-05T00:02:00Z"
  }
}
```

**Auth:** ✅ Required

---

## Mining Routes (`/api/mining`)

### POST `/api/mining/start`
Start a 6-hour mining session.

**Request:** No body

**Response (200):**
```json
{
  "success": true,
  "miningStartedAt": "2026-03-04T12:00:00Z",
  "durationMs": 21600000
}
```

**Errors:**
- 400: `"Mining already active"`
- 404: `"User not found"`

**Auth:** ✅ Required

---

### POST `/api/mining/claim`
Claim mining reward (250 points) after 6 hours.

**Request:** No body

**Response (200):**
```json
{
  "success": true,
  "points": 1750,
  "level": "Dreamer"
}
```

**Errors:**
- 400: `"No active mining"` or `"Mining not complete"`
- 403: `"Mining not complete"`

**Auth:** ✅ Required

---

## Daily Check-In Routes (`/api/dailyCheckIn`, `/api/tasks/daily-checkin`)

### GET `/api/dailyCheckIn/status`
Get check-in status, streak, and calendar.

**Request:** No body

**Response (200):**
```json
{
  "success": true,
  "streak": 3,
  "checkedInToday": false,
  "dayKey": "2026-03-04",
  "resetAtUtc": "2026-03-05T00:02:00Z",
  "reward": {"points": 1000, "bronzeTickets": 100, "xp": 5},
  "calendar": [
    {"dayKey": "2026-02-18", "status": "upcoming", "checked": false},
    {"dayKey": "2026-03-02", "status": "checked", "checked": true},
    {"dayKey": "2026-03-03", "status": "checked", "checked": true},
    {"dayKey": "2026-03-04", "status": "available", "checked": false}
  ]
}
```

**Auth:** ✅ Required

---

### POST `/api/dailyCheckIn/verify`
Verify check-in payment and apply rewards.

**Request:**
```json
{"txHash": "hash..." } or {"txBoc": "boc..."}
```

**Response (200):**
```json
{
  "success": true,
  "points": 10000,
  "xp": 30,
  "bronzeTickets": 1500,
  "streak": 4,
  "level": "Dreamer",
  "badges": [],
  "perfectStreakBadgeAwarded": false,
  "dayKey": "2026-03-04",
  "calendar": [...]
}
```

**Errors:**
- 400: `"Already checked in today"`, `"Transaction not verified"`, etc.
- 404: `"User not found"`

**Auth:** ✅ Required

---

## Tasks Routes (`/api/tasks`)

### GET `/api/tasks/definitions`
Get daily and one-time task catalog.

**Request:** No body

**Response (200):**
```json
{
  "daily": [
    {"id": "daily-checkin", "title": "Daily Check-in", "reward": 1000, ...},
    {"id": "play-puzzle", "title": "Play Puzzles", "reward": 100, ...}
  ],
  "oneTime": [
    {"id": "join-telegram", "title": "Subscribe to Telegram", "reward": 200, ...}
  ]
}
```

**Auth:** ✅ Required

---

### POST `/api/tasks/complete`
Mark a task as complete (no proof required).

**Request:**
```json
{"taskId": "visit-telegram"}
```

**Response (200):**
```json
{"success": true, "points": 100}
```

**Auth:** ✅ Required

---

### POST `/api/tasks/verify-proof`
Upload screenshot proof for one-time task.

**Request:** Multipart form
```
taskId: "join-telegram"
proof: <image file>
```

**Response (200):**
```json
{"success": true, "points": 200}
```

**Auth:** ✅ Required

---

## Referral Routes (`/api/invite`)

### GET `/api/invite/link`
Get user's personal invite link.

**Request:** No body

**Response (200):**
```json
{"inviteLink": "https://t.me/hope_official_bot/app?startapp=abc123def"}
```

**Auth:** ✅ Required

---

### GET `/api/invite/progress`
Get referral milestones progress.

**Request:** No body

**Response (200):**
```json
{
  "invitedCount": 3,
  "completedTasks": [1]
}
```

**Auth:** ✅ Required

---

### GET `/api/invite/verify?target=3`
Check if milestone is reached.

**Request:** Query: `target` (1, 3, 5, or 10)

**Response (200):**
```json
{"completed": true, "claimed": false}
```

**Auth:** ✅ Required

---

### POST `/api/invite/claim?target=3`
Claim milestone reward.

**Request:** Query: `target` (1, 3, 5, or 10)

**Response (200):**
```json
{"success": true}
```

**Errors:**
- 400: `"Target not reached"`, `"Already claimed"`

**Auth:** ✅ Required

---

### POST `/api/invite/register`
Register new user via invite code (auto-called on signup).

**Request:**
```json
{"inviteCode": "abc123def", "newUserId": 987654321}
```

**Response (200):**
```json
{"success": true}
```

**Auth:** ❌ Public

---

## Marketplace Routes

### Exchange Tickets (`/api/exchangeTickets`)

#### POST `/api/exchangeTickets`
Trade Bronze↔Silver or Silver↔Gold tickets.

**Request:**
```json
{
  "fromType": "bronze",
  "quantity": 1,
  "txHash": "hash..."
}
```

**Response (200):**
```json
{
  "message": "Ticket exchange successful",
  "bronzeTickets": 900,
  "silverTickets": 10,
  "goldTickets": 0
}
```

**Auth:** ✅ Required

---

### Mystery Box (`/api/mysteryBox`)

#### GET `/api/mysteryBox/status`
Get today's box purchase status and active puzzle.

**Response (200):**
```json
{
  "success": true,
  "purchasedToday": 1,
  "limit": 3,
  "nextBoxType": "silver",
  "todayBoxes": [{"boxType": "bronze", "status": "claimed"}],
  "activeBox": {
    "boxType": "silver",
    "status": "opened",
    "puzzle": {
      "meme": "Pepe",
      "imageUrl": "...",
      "sessionId": "uuid",
      "pieces": [{pieceId, sourceIndex}, ...],
      "solved": false
    }
  }
}
```

**Auth:** ✅ Required

---

#### POST `/api/mysteryBox/purchase`
Purchase a mystery box (pay $0.1 USDT).

**Request:**
```json
{"txHash": "hash..." } or {"txBoc": "boc..."}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Purchased bronze mystery box",
  "boxType": "bronze",
  "purchasedToday": 1,
  "limit": 3,
  ...
}
```

**Auth:** ✅ Required

---

#### POST `/api/mysteryBox/open`
Open purchased box and get puzzle.

**Request:** No body

**Response (200):**
```json
{
  "success": true,
  "boxType": "bronze",
  "puzzle": {...},
  "timerSeconds": 60,
  "pieces": 10
}
```

**Auth:** ✅ Required

---

#### POST `/api/mysteryBox/solve`
Submit puzzle piece arrangement.

**Request:**
```json
{
  "arrangement": ["pId1", "pId2", ...],
  "sessionId": "uuid"
}
```

**Response (200):**
```json
{"success": true, "message": "Puzzle solved"}
```

**Errors:**
- 400: `"Invalid arrangement"`, `"Puzzle time expired"`, etc.

**Auth:** ✅ Required

---

#### POST `/api/mysteryBox/claim`
Claim rewards after solving.

**Request:** No body

**Response (200):**
```json
{
  "success": true,
  "message": "Rewards claimed",
  "rewards": {"points": 200, "bronzeTickets": 10, "xp": 1},
  "user": {
    "points": 10200,
    "bronzeTickets": 1510,
    "xp": 31,
    "level": "Dreamer"
  },
  ...
}
```

**Auth:** ✅ Required

---

## Leaderboard Routes (`/api/leaderboard`)

### GET `/api/leaderboard/by-level/:levelIndex`
Get top 100 users for a level.

**Request:** Path: `levelIndex` (1-10)

**Response (200):**
```json
{
  "levelIndex": 1,
  "levelName": "Seeker",
  "users": [
    {"telegramId": 111, "username": "user1", "xp": 100, "points": 25000},
    {"telegramId": 222, "username": "user2", "xp": 90, "points": 20000}
  ]
}
```

**Auth:** ✅ Required

---

## Weekly Drop Contest (`/api/weeklyDrop`)

### GET `/api/weeklyDrop/eligibility`
Check if user meets all entry requirements.

**Request:** No body

**Response (200):**
```json
{
  "eligible": true,
  "level": "Believer",
  "streak": 10,
  "goldTickets": 12
}
```

**Auth:** ✅ Required

---

### POST `/api/weeklyDrop/enter`
Enter the weekly contest (deduct 10 Gold + $0.5 fee).

**Request:**
```json
{"boc": "boc..."}
```

**Response (200):**
```json
{"success": true, "message": "You are in the Weekly Drop!"}
```

**Errors:**
- 400: `"You must be Believer level"`, `"Perfect streak required"`, etc.

**Auth:** ✅ Required

---

## TON Integration (`/api/tonAmount`)

### GET `/api/tonAmount/ton-amount?usd=0.3`
Get TON equivalent for USD amount.

**Request:** Query: `usd` (default: 0.3)

**Response (200):**
```json
{
  "tonAmount": 0.046731,
  "recipientAddress": "UQB...",
  "usd": 0.3
}
```

**Auth:** ✅ Required

---

## Admin Routes (`/api/admin`)

All admin routes require `isAdmin: true` flag.

### GET `/api/admin/stats`
Overall app statistics.

**Response (200):**
```json
{
  "success": true,
  "stats": {
    "users": 1523,
    "admins": 2,
    "activeMiners": 45,
    "contestants": 12
  }
}
```

---

### GET `/api/admin/users?page=1&limit=20&search=john`
Paginated user list.

**Response (200):**
```json
{
  "success": true,
  "pagination": {"page": 1, "limit": 20, "total": 500, "pages": 25},
  "users": [{telegramId, username, points, level, ...}]
}
```

---

### PATCH `/api/admin/users/:telegramId`
Edit user properties.

**Request:**
```json
{"points": 5000, "level": "Believer", "isAdmin": false}
```

**Response (200):**
```json
{"success": true, "user": {...}}
```

---

### GET `/api/admin/tasks`, `PUT /api/admin/tasks`
Get/update task catalog.

---

### GET `/api/admin/contests/overview?week=Week%201`
Contest entries overview.

---

### POST `/api/admin/contests/results`
Publish contest winners.

**Request:**
```json
{
  "week": "Week 1",
  "winnerTelegramIds": [123, 456],
  "message": "Congrats winners!"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

**Common Status Codes:**
- `200` – Success
- `400` – Bad request (invalid params, insufficient balance, etc.)
- `403` – Forbidden (not eligible, not admin, etc.)
- `404` – Not found  
- `500` – Server error
- `503` – Service unavailable (price API down)

---

## Rate Limiting

**Global:** 100 requests per 15 minutes per IP

All `/api/*` endpoints are rate-limited.

---

## Authentication Header

JWT is automatically sent via httpOnly cookie after `/api/auth/telegram` call.  
No manual Authorization header needed for subsequent requests in same session.

---

**For full documentation, see [README.md](./README.md)**
