# Hope Product Requirements Document (PRD)

Version: 2.1
Last Updated: March 25, 2026
Platform: Telegram Mini App
Frontend: Vanilla HTML/CSS/JavaScript
Backend: Node.js + Express + MongoDB

---

## 1. Product Overview

Hope is a Telegram Mini App that provides a gamified crypto environment where users engage in activities such as mining points, playing lightweight games,exchanging tickets across tiers, participating in weekly drop contests, and maintaining daily check-in streaks.

Core user loops:

- Start and claim 6-hour mining cycles.
- Complete daily check-ins and task actions.
- Play games from the Games Launcher.
- Exchange ticket tiers (Bronze -> Silver -> Gold) in-app.
- Progress through leaderboard levels and referral milestones.
- Enter Weekly Drop when eligibility conditions are met.

### Active Games Stack

The games layer now uses a plugin-based Games Engine with:

- `mystery-box`
- `flipcards`
- `quiz` and `treasure-hunt` reserved as coming soon

---

## 2. Goals

- Increase daily active usage through repeated low-friction loops.
- Keep core gameplay server-authoritative and anti-cheat oriented.
- Maintain predictable ticket progression with transparent conversion ratios.
- Support secure Telegram-native auth and wallet-linked blockchain actions where needed.

---

## 3. Navigation Structure

Top-level tabs/pages:

- Home: mining, stats, weekly drop entry status
- Leaders: level-based leaderboard
- Invite: referral link, milestones, claims
- Marketplace: exchange + games
- Tasks: daily and one-time tasks

Marketplace includes:

- Exchange panel (free in-app ticket conversion)
- Games launcher panel (dynamic game catalog)

---

## 4. Core Features

### 4.1 Mining

- User starts mining session via `/api/mining/start`.
- Session duration: 6 hours.
- Claim via `/api/mining/claim`.
- Reward: 250 points.

### 4.2 Daily Check-In

- Status endpoint: `/api/dailyCheckIn/status`.
- Verify endpoint: `/api/dailyCheckIn/verify`.
- Requires on-chain proof (`txHash` or `txBoc`).
- Verified payment amount target: $0.30 equivalent in TON.
- Applies streak logic, badge logic, and daily rewards.

### 4.3 Tasks

- Task catalog from `/api/tasks/definitions`.
- Task completion via `/api/tasks/complete`.
- Verification flow via `/api/tasks/start-verify` and `/api/tasks/claim-verify`.

### 4.4 Referral and Invite

- Invite link endpoint: `/api/invite/link`.
- Progress endpoint: `/api/invite/progress`.
- Claim milestone rewards via `/api/invite/claim`.

### 4.5 Games Launcher

Backend endpoint: `/api/games/catalog`

#### Mystery Box (`mystery-box`)

- Purchase endpoint: `/api/mysteryBox/purchase`.
- Open endpoint: `/api/mysteryBox/open`.
- On-chain proof required for purchase (`txHash` or `txBoc`).
- Price target: $0.15 equivalent in TON.
- Daily structure: 3 rounds, 9 boxes max/day, strict order bronze -> silver -> gold.

#### Flip Cards (`flipcards`)

- Daily pass purchase endpoint: `/api/games/flipcards/purchase`.
- Requires on-chain proof (`txHash` or `txBoc`).
- Default pass price: $0.55 equivalent in TON.
- Pass validity: 24 hours.
- Gameplay endpoints:
  - `/api/games/flipcards/start`
  - `/api/games/flipcards/move`
  - `/api/games/flipcards/complete`
- Move spam guard: 300ms per-move cooldown.

### 4.6 Ticket Exchange

Endpoint: `/api/exchangeTickets`

- Conversion is free in-app.
- No blockchain transaction required.
- No on-chain verification required.
- Conversion rate: 100:1
  - Bronze -> Silver
  - Silver -> Gold

### 4.7 Weekly Drop

Endpoints:

- `/api/weeklyDrop/eligibility`
- `/api/weeklyDrop/enter`

Requirements:

- Level >= Believer
- Streak >= 10
- Gold tickets >= 10
- Linked wallet
- Not already entered current week

Entry requires verified on-chain payment proof (target $0.50 equivalent in TON).

---

## 5. Security and Authentication

### Telegram Auth

- Validate Telegram `initData` using HMAC-SHA256 with `BOT_TOKEN`.
- Enforce auth timestamp age and future skew checks.

### Session/Auth Tokens

- JWT issued after Telegram auth.
- Current token expiry: 7 days.
- JWT stored in httpOnly cookie (`jwt`).
- Cookie `secure` and `sameSite` behavior depends on env and HTTPS context.

### Rate Limiting

- Auth limiter: 10 requests / 15 minutes.
- General API limiter: 100 requests / 15 minutes in production.
- Games limiter: 500 requests / 15 minutes per telegramId in production.
- Additional per-move cooldown for game move endpoints.

### Wallet Integrity

- Wallet normalization and TON mainnet enforcement on save.
- Wallet uniqueness enforced at DB level (`User.wallet` unique + sparse).

### Transaction Verification

Server-side TON verification required for:

- Daily check-in
- Mystery box purchase
- Flip cards pass purchase
- Weekly drop entry

Not required for:

- `exchangeTickets` (free in-app conversion)

---

## 6. Data Model (Key Entities)

### User

Key fields:

- `telegramId` (unique, indexed)
- `username`
- `points`, `xp`, `level`
- `streak`
- `wallet` (unique, sparse)
- `bronzeTickets`, `silverTickets`, `goldTickets`
- `flipcardsPass` state

### GameSession

Server-authoritative game state for flipcards sessions:

- card layout
- matched triplets
- move history
- anti-cheat checks
- reward claim status

### MysteryBox

Tracks purchased and opened boxes by day:

- `telegramId`
- `boxType`
- `status`
- `transactionId`
- `reward`

### Contestant

Weekly drop entries per week per user.

---

## 7. API Scope Summary

Public auth:

- `POST /api/auth/telegram`
- `POST /api/web-auth/register`
- `POST /api/web-auth/login`

Authenticated core:

- `/api/user/*`
- `/api/mining/*`
- `/api/dailyCheckIn/*`
- `/api/tasks/*`
- `/api/invite/*`
- `/api/exchangeTickets`
- `/api/mysteryBox/*`
- `/api/games/*`
- `/api/weeklyDrop/*`
- `/api/leaderboard/*`

Admin:

- `/api/admin/*`
- `/api/rewards/*`

---

## 8. Non-Functional Requirements

- Mobile-first Telegram WebView experience.
- API responses should be `no-store` cache controlled.
- Real-time user and leaderboard sync via Socket.IO.
- Stable behavior under shared IP conditions in Telegram environment.

---

## 9. Acceptance Criteria

- Core endpoint catalog reflects the current game stack.
- Games catalog and marketplace docs reflect mystery box + flipcards stack.
- Ticket exchange is documented as free in-app conversion.
- On-chain verification matrix matches current backend behavior.
- Security and rate-limit settings in docs match implementation.

