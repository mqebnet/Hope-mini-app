# Development Guide

Practical development notes for the Hope backend.

## 1. Setup

```bash
cd hope-backend
npm install
```

Create/update `.env` with at least:

- `MONGODB_URI`
- `BOT_TOKEN`
- `JWT_SECRET`
- `DEV_WALLET_ADDRESS` (or `TON_WALLET_ADDRESS`)

## 2. Run Locally

Start server:

```bash
node app.js
```

Run with file watch:

```bash
node --watch app.js
```

## 3. Project Layout

- `app.js`: express app bootstrap, middleware, route mounting, socket setup
- `routes/`: API handlers
- `middleware/`: auth, page gate, admin gate, rate limiters
- `models/`: MongoDB models
- `services/games/`: plugin game engine
- `utils/`: shared helpers and TON verification

## 4. Debugging Workflow

- Watch request logs from `app.js` (`[REQ] METHOD PATH`).
- Check auth failures in:
  - `routes/auth.js`
  - `middleware/apiAuth.js`
- Check TON verification failures in:
  - `utils/tonHandler.js`
- Check game-related errors in:
  - `routes/games.js`
  - `services/games/plugins/*`

## 5. Common Commands

Syntax check a file:

```bash
node --check routes/games.js
```

Find routes quickly:

```bash
rg "router\\.(get|post|put|patch|delete)\\(" routes
```

Find env variable usage:

```bash
rg "process\\.env\\." -n
```

## 6. Development Notes

- `exchangeTickets` is free in-app conversion and does not require chain verification.
- Blockchain verification is still required for paid actions:
  - daily check-in
  - mystery-box purchase
  - flipcards pass purchase
  - weekly drop entry
- Wallet linking enforces TON mainnet and unique wallet constraint.

## 7. Pre-PR Checklist

- Run syntax checks for touched JS files.
- Confirm changed docs match actual route behavior.
- Confirm no stale references to retired puzzle flow remain.
- Verify no references to deleted markdown files remain.

