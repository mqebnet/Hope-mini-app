# Flip Cards Game & Games Launcher Implementation Guide

## Overview

The Hope mini-app now features a gamified **Flip Cards** game with **triplet matching** (3 cards per set) and a modular **Games Launcher** system. This makes Hope stand out with a unique gameplay mechanic not commonly found in Telegram games.

---

## Architecture

### 1. Games Catalog & Launcher

**File:** [games.js](games.js)

The games module provides:
- **Dynamic game registry** (`GAMES_CATALOG`)
- **Game card rendering** with hover animations
- **Game opening handler** with routing
- **Easy extensibility** for future games

```javascript
const GAMES_CATALOG = [
  {
    id: 'mystery-box',
    name: 'Mystery Box',
    icon: '🎁',
    description: 'Open reward boxes...'
  },
  {
    id: 'flip-cards',
    name: 'Flip Cards',
    icon: '🎴',
    description: 'Match triplets of cards...'
  }
  // Add more games here
];
```

### 2. Flip Cards Game Flow

```
User navigates to Marketplace
        ↓
Clicks "Play" on Flip Cards card
        ↓
Redirects to flipcards.html
        ↓
Frontend calls GET /api/games/flipcards/start
        ↓
Server generates shuffled triplet board (3 triplets = 9 cards)
        ↓
User flips up to 3 cards
        ↓
Frontend sends POST /api/games/flipcards/move
        ↓
Server validates move & checks for triplet match
        ↓
If all triplets matched within 60s → game complete
        ↓
POST /api/games/flipcards/complete
        ↓
Rewards awarded (points, XP, bronze tickets)
        ↓
Show reward modal & return to marketplace
```

---

## Backend Implementation

### Database Schema: GameSession

**File:** [models/GameSession.js](models/GameSession.js)

```javascript
{
  _id: ObjectId,
  telegramId: Number,          // User ID
  gameType: 'flipcards',
  status: 'active' | 'completed' | 'abandoned',
  
  cards: [
    { id, symbol, tripletId, revealed }
  ],
  
  cardStateChecksum: String,    // Anti-cheat: hash of original state
  matchedTriplets: [String],    // Group IDs matched
  totalTriplets: Number,
  
  moves: [
    { cardIds, timestamp, duration }
  ],
  
  startedAt: Date,
  completedAt: Date,
  timeUsedSeconds: Number,
  
  reward: {
    points: Number,
    xp: Number,
    bronzeTickets: Number
  },
  
  speedAnalysis: {
    avgMoveTime: Number,
    suspiciousPattern: Boolean,
    flagReason: String
  }
}
```

### API Endpoints

**Base:** `/api/games`

#### 1. POST `/flipcards/start`
**Start a new game**

**Request:**
```json
{
  "difficulty": "normal"  // "easy", "normal", "hard"
}
```

**Response:**
```json
{
  "success": true,
  "gameSessionId": "66abc123...",
  "cards": [
    { "id": "card_0", "symbol": "🌟", "revealed": false },
    ...
  ],
  "totalPairs": 9,
  "timeLimit": 60,
  "difficulty": "normal"
}
```

**Difficulty Mapping:**
- `easy`: 3 triplets (9 cards)
- `normal`: 4 triplets (12 cards)
- `hard`: 5 triplets (15 cards)

---

#### 2. POST `/flipcards/move`
**Record a card flip**

**Request:**
```json
{
  "gameSessionId": "66abc123...",
  "cardIds": ["card_0", "card_1", "card_2"],  // 1-3 cards
  "clientDuration": 2500  // milliseconds since game start
}
```

**Response:**
```json
{
  "success": true,
  "matched": true,
  "matchedTripletId": "triplet_0",
  "completionPercent": 33,
  "gameComplete": false,
  "reward": null  // Non-null if gameComplete = true
}
```

**Validation:**
- ✓ Cards exist and belong to same triplet (for match)
- ✓ Cards not already matched
- ✓ Time limit not exceeded
- ✓ Flipped cards not already revealed

---

#### 3. POST `/flipcards/complete`
**Claim reward (must call after game complete)**

**Request:**
```json
{
  "gameSessionId": "66abc123..."
}
```

**Response:**
```json
{
  "success": true,
  "reward": {
    "points": 75,
    "xp": 12,
    "bronzeTickets": 5
  },
  "stats": {
    "moves": 4,
    "time": 35,
    "completion": 100
  },
  "newStats": {
    "points": 1250,
    "xp": 145,
    "level": "Pioneer",
    "bronzeTickets": 145
  }
}
```

---

#### 4. GET `/flipcards/status/:gameSessionId`
**Check game status (page reload recovery)**

**Response:**
```json
{
  "success": true,
  "status": "active",
  "cards": [...],
  "matchedCount": 2,
  "totalTriplets": 4,
  "timeElapsed": 25,
  "timeLimit": 60,
  "reward": null
}
```

---

#### 5. DELETE `/flipcards/:gameSessionId`
**Abandon a game**

**Response:**
```json
{
  "success": true,
  "message": "Game abandoned"
}
```

---

## Frontend Implementation

### Main Game Component: FlipCardsGame

**File:** [flipCards.js](flipCards.js)

```javascript
export class FlipCardsGame {
  async startGame(difficulty = 'normal')
  onCardClick(cardId)
  async checkMove()
  endGame(reward)
  async abandonGame()
  showRewardScreen(reward, stats, newStats)
  showNotification(message, type)
}
```

**Usage:**
```javascript
const game = new FlipCardsGame();
await game.startGame('normal');  // Initializes board, starts timer
// Game is fully interactive after this

// User clicks cards → onCardClick() is triggered
// After 3 cards → checkMove() validates and awards/rejects match
// Game auto-completes when all triplets matched
```

---

### Games Launcher Module

**File:** [games.js](games.js)

```javascript
// Initialize games grid
renderGamesGrid(containerId)

// Open a game
openGame(gameId)

// Get game info
getGameDetails(gameId)
getAllGames()
```

**Usage:**
```javascript
import { initGamesSection, openGame } from './games.js';

// Auto-runs on DOMContentLoaded
// Renders game cards in #games-container

// User clicks Play → openGame('flip-cards')
// Redirects to flipcards.html
```

---

## Anti-Cheat Mechanisms

### 1. Server-Side State Authority
- Cards stay on server; clients never receive triplet groupings
- Client only sees: `{ id, symbol, revealed }`
- Triplet info only sent after successful match

### 2. Move Validation
- Verify cards exist and belong to same triplet
- Check cards not already matched
- Validate time limits

### 3. Speed Analysis
```javascript
const suspicious = session.detectSuspiciousActivity();
// Flags if:
// - Average move time < 200ms (humanly impossible)
// - Perfect score in < 15 seconds (ultra-fast + no mismatches)
// - Penalty applied: 50% reward reduction
```

### 4. Checksums
- Card state hashed on server before sending to client
- Could extend to validate unmodified state (future enhancement)

### 5. Flagging & Admin Review
- Suspicious sessions marked: `suspiciousPattern = true`
- Admin can review via `/api/admin` endpoints future
- Rewards still awarded but flagged for audit

---

## Reward Calculation

```javascript
const basePoints = 50;

// Perfect play bonus (no mismatches)
const perfectBonus = (matchAttempts === totalTriplets) ? 1.5 : 1;

// Speed bonus
const speedBonus = Math.max(1, 2 - timeUsedSeconds / 30);

const finalPoints = Math.floor(basePoints * perfectBonus * speedBonus);
const xp = Math.floor(10 * perfectBonus * speedBonus);
const bronzeTickets = Math.random() > 0.7 ? 5 : 0;  // 30% chance
```

**Example:**
- Perfect game in 20 seconds: 50 * 1.5 * 1.33 ≈ **100 points**
- One mistake in 40 seconds: 50 * 1 * 0.67 ≈ **33 points**
- Suspicious activity (flagged): 50% reduction applied

---

## UI/UX Features

### 1. Games Grid
- Responsive grid (auto-fit, min 160px cards)
- Neon glow hover effects
- Smooth scale animations
- Mobile optimized (2 columns on small screens)

### 2. Flip Cards Board
- 3D CSS flip animations
- Hover visual feedback on unrevealed cards
- Matched cards glow and lock
- Responsive 3-column grid on mobile

### 3. Difficulty Selector
- 3 buttons: 🌱 Easy, ⚡ Normal, 🔥 Hard
- Each shows triplet count
- Visual feedback on hover

### 4. Timer
- Large 24px display (top-left)
- Warning state (red/orange) at ≤15 seconds
- Pulse animation during danger zone
- Auto-timeout at 0s

### 5. Reward Modal
- Stats display (moves, time, completion %)
- Reward breakdown (points, XP, bronze tickets)
- New stats display (updated totals)
- "Back to Games" button for navigation

---

## File Structure

```
hope-backend/
├── models/
│   └── GameSession.js          [NEW] Game session schema
├── routes/
│   └── games.js                [NEW] All game endpoints
├── public/
│   ├── games.js                [NEW] Games launcher frontend
│   ├── flipCards.js            [NEW] Flip Cards game logic
│   ├── flipcards.html          [NEW] Flip Cards page
│   ├── marketPlace.html        [UPDATED] Games tab
│   ├── marketPlace.js          [UPDATED] Tab routing
│   ├── styles.css              [UPDATED] Game styles
│   └── server.js               [UPDATED] Route mounting

hope-frontend/
└── (static files served from public/)
```

---

## Adding New Games

### Step 1: Add to Catalog
`games.js`:
```javascript
const GAMES_CATALOG = [
  ...existing,
  {
    id: 'memory-blocks',
    name: 'Memory Blocks',
    icon: '🧩',
    description: 'Tap blocks in sequence...',
    component: 'memory-blocks',
    route: 'memoryblocks.html'
  }
];
```

### Step 2: Create GameSession Model (if needed)
Extend or use existing `GameSession` model for all games.

### Step 3: Create API Routes
`routes/games.js`:
```javascript
router.post('/memoryblocks/start', apiAuth, async (req, res) => {
  // Initialize game
});

router.post('/memoryblocks/move', apiAuth, async (req, res) => {
  // Validate move
});

router.post('/memoryblocks/complete', apiAuth, async (req, res) => {
  // Award rewards
});
```

### Step 4: Create Frontend Game Module
`public/memoryBlocks.js`:
```javascript
export class MemoryBlocksGame {
  async startGame(difficulty) { }
  onBlockClick(blockId) { }
  // ...
}
```

### Step 5: Create Game Page
`public/memoryblocks.html` (similar to flipcards.html)

### Step 6: Update Games Router
`games.js` `openGame()` function:
```javascript
case 'memory-blocks':
  window.location.href = 'memoryblocks.html';
  break;
```

---

## Testing

### Local Testing

1. **Start Game**
```bash
curl -X POST http://localhost:3000/api/games/flipcards/start \
  -H "Cookie: token=YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"difficulty":"normal"}'
```

2. **Simulate Moves**
```bash
curl -X POST http://localhost:3000/api/games/flipcards/move \
  -H "Cookie: token=YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "gameSessionId":"66abc123",
    "cardIds":["card_0","card_1","card_2"],
    "clientDuration":2500
  }'
```

3. **Complete Game**
```bash
curl -X POST http://localhost:3000/api/games/flipcards/complete \
  -H "Cookie: token=YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"gameSessionId":"66abc123"}'
```

### Frontend Testing

1. Navigate to http://localhost:3000/marketPlace.html
2. Click "Games" tab
3. Click "Play" on Flip Cards
4. Try different difficulties
5. Match all triplets within 60 seconds
6. Verify rewards display correctly

---

## Performance Notes

- **Card shuffle:** O(n) Fisher-Yates algorithm
- **Move validation:** O(n) card search (small n = no concern)
- **Database:** Single GameSession document per game (minimal overhead)
- **Checksum:** SHA256 hash (negligible cost)
- **Speed analysis:** Optional flag, can be toggled in production

---

## Known Limitations & Future Enhancements

### Current
- ✓ Triplet matching (unique feature!)
- ✓ 60-second timer
- ✓ Basic anti-cheat (speed, pattern detection)
- ✓ Difficulty levels
- ✓ Reward scaling

### Future
- [ ] Leaderboard for game high scores
- [ ] Achievements/badges (first perfect game, etc.)
- [ ] Daily challenge with bonus rewards
- [ ] Multiplayer competitive mode
- [ ] Game replays for admin review
- [ ] In-game power-ups (hint, time extension)
- [ ] Sound effects & haptic feedback
- [ ] More game types (puzzle, sequence, memory)

---

## Environment Variables

No new env vars required. Uses existing:
- `MONGODB_URI` - Database connection
- `BOT_TOKEN` - Telegram bot (for notifications)
- `DEV_WALLET_ADDRESS` - Optional (for future NFT rewards)

---

## Troubleshooting

### Game won't start
- Check `/api/games/flipcards/start` returns valid gameSessionId
- Verify JWT cookie is set properly
- Check console for network errors

### Cards not flipping
- Ensure `flipCards.js` is loaded (check Network tab)
- Verify CSS has `.flipcard.flipped` rule
- Check browser supports CSS 3D transforms

### Rewards not displaying
- Verify game status is truly `completed`
- Check `/api/games/flipcards/move` returns `gameComplete: true`
- Ensure `POST /flipcards/complete` returns reward data

### Timer keeps running after game ends
- Check `clearInterval(this.timerInterval)` is called in `endGame()`
- Verify `isGameActive` flag is set to `false`

---

## Questions?

This implementation provides a solid foundation for extending Hope with more mini-games. Each new game follows the same pattern:
1. Initialize game session
2. Record moves/events
3. Validate anti-cheat
4. Award rewards on completion

Happy gaming! 🎮
