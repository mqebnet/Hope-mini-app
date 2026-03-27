# Hope API Reference

This is the current backend endpoint reference.

Base URL (local): `http://localhost:3000`

## Authentication

### POST `/api/auth/telegram`
Verify Telegram `initData`, create/login user, set `jwt` cookie.

Request body:

```json
{ "initData": "query_id=...&user=...&hash=..." }
```

### POST `/api/web-auth/register`
Web/email registration flow (non-Telegram).

### POST `/api/web-auth/login`
Web/email login flow.

---

## User

### GET `/api/me`
Alias user summary for authenticated session.

### GET `/api/user/me`
Get full user profile, balances, streak, check-in calendar summary, task completion.

### POST `/api/user/wallet`
Link wallet to account.

Request body:

```json
{ "wallet": "UQ..." }
```

Notes:

- Testnet wallets are rejected.
- Wallet must be unique across users.

---

## Mining

### POST `/api/mining/start`
Start 6-hour mining cycle.

### POST `/api/mining/claim`
Claim mining reward when complete.

---

## Daily Check-In

### GET `/api/dailyCheckIn/status`
Get day key, reward preview, streak, and calendar state.

### POST `/api/dailyCheckIn/verify`
Verify on-chain check-in payment and apply reward.

Request body:

```json
{ "txHash": "..." }
```

or

```json
{ "txBoc": "..." }
```

---

## Tasks

### GET `/api/tasks/definitions`
Task catalog (daily + one-time).

### POST `/api/tasks/complete`
Complete a non-proof task.

### POST `/api/tasks/start-verify`
Start proof-based task verification flow.

### POST `/api/tasks/claim-verify`
Finalize proof-based task claim.

### POST `/api/tasks/daily-checkin`
Tasks-scoped check-in verification flow.

### GET `/api/tasks/pending-verifications`
Fetch pending proof tasks for review flow.

---

## Invite

### GET `/api/invite/link`
Get personal invite link.

### GET `/api/invite/progress`
Get referral milestones and claim status.

### POST `/api/invite/claim`
Claim eligible referral milestone.

Additional support endpoints:

- `POST /api/invite/register-session`
- `POST /api/invite/ensure-codes`
- `GET /api/invite/verify`
- `GET /api/invite/top-referrers`

---

## Exchange Tickets

### POST `/api/exchangeTickets`
Free in-app ticket conversion.

Request body:

```json
{
  "fromType": "bronze",
  "quantity": 3
}
```

Rules:

- `fromType`: `bronze` or `silver`
- Conversion rate: `100:1`
- No on-chain transaction required

---

## Games and Mystery Box

### GET `/api/games/catalog`
Dynamic game catalog from plugin registry.

### Generic game endpoints

- `POST /api/games/:gameId/start`
- `POST /api/games/:gameId/move`
- `POST /api/games/:gameId/complete`
- `POST /api/games/:gameId/claim`
- `POST /api/games/:gameId/purchase`
- `GET /api/games/:gameId/status`
- `GET /api/games/:gameId/session/:gameSessionId`
- `DELETE /api/games/:gameId/session/:gameSessionId`

### Legacy flipcards compatibility endpoints

- `POST /api/games/flipcards/start`
- `POST /api/games/flipcards/move`
- `POST /api/games/flipcards/complete`
- `GET /api/games/flipcards/status/:gameSessionId`
- `DELETE /api/games/flipcards/:gameSessionId`

### Mystery Box wrapper routes

- `GET /api/mysteryBox/status`
- `POST /api/mysteryBox/purchase` (requires `txHash` or `txBoc`)
- `POST /api/mysteryBox/open`
- `POST /api/boxes/open` (alternate open route)

---

## Leaderboard

### GET `/api/leaderboard/by-level/:levelIndex`
Get leaderboard for a specific level.

---

## Weekly Drop

### GET `/api/weeklyDrop/eligibility`
Check entry eligibility.

### POST `/api/weeklyDrop/enter`
Enter weekly drop (requires transaction proof).

Request body:

```json
{ "txHash": "..." }
```

or

```json
{ "txBoc": "..." }
```

---

## Transactions

### POST `/api/transactions`
Record transaction intent.

### GET `/api/transactions`
List current user transaction history.

---

## Admin

### `/api/admin/*`
Admin operations (users, tasks, contest controls, broadcast, scheduler operations).

### `/api/rewards/*`
Manual reward grant endpoints.

---

## TON Helper

### GET `/api/tonAmount/ton-amount`
Compute TON amount equivalents using backend pricing utility.

