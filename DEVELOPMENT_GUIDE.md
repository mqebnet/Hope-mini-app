# Development Guide

Practical guide for developers working on the Hope backend.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Running the Server](#running-the-server)
- [Database Setup](#database-setup)
- [Debugging & Logging](#debugging--logging)
- [Testing Endpoints](#testing-endpoints)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- **Node.js** 16+ ([download](https://nodejs.org/))
- **MongoDB** (local or cloud)
- **Postman** or **curl** (for API testing)
- **Telegram Bot Token** (from [@BotFather](https://t.me/botfather))

### Initial Setup

```bash
# Clone/navigate to backend folder
cd hope-backend

# Install dependencies
npm install

# Copy example env (if available) or create .env
cp .env.example .env
# OR manually create and edit .env with your config

# Start server
npm start
```

### Default Ports

- **Backend:** `http://localhost:3000`
- **MongoDB:** `mongodb://localhost:27017` (if local)
- **Frontend dev:** `http://localhost:5173` (Vite)

---

## Running the Server

### Start in Development Mode

```bash
npm start
```

Output should show:
```
Connected to MongoDB
Server running on http://localhost:3000
```

### Start with nodemon (auto-reload on changes)

```bash
npm install --save-dev nodemon
npx nodemon server.js
```

### Environment Modes

Create separate `.env` files:

- `.env` – Default (development)
- `.env.production` – For production build
- `.env.test` – For test suite

Switch modes:
```bash
NODE_ENV=production npm start
```

---

## Database Setup

### MongoDB Local (macOS/Linux/WSL)

```bash
# Install MongoDB (if not already)
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# Verify it's running
mongosh

# Inside mongosh:
> show databases
> use hope
> db.users.find().limit(1)
```

### MongoDB Cloud (Atlas)

1. Create free cluster at [atlas.mongodb.com](https://www.mongodb.com/cloud/atlas)
2. Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/hope`
3. Add to `.env`:
   ```env
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/hope
   ```

### View Data

**Via mongosh (CLI):**
```bash
mongosh
> use hope
> db.users.find().pretty()
> db.users.findOne({telegramId: 123456789})
> db.users.countDocuments()
```

**Via Compass (GUI):**
- Download: [mongodb.com/products/compass](https://www.mongodb.com/products/compass)
- Connect to `mongodb://localhost:27017` or atlas URI
- Browse collections visually

---

## Debugging & Logging

### Console Logs

The server logs all requests and errors:

```javascript
[REQ] GET /api/user/me
[REQ] POST /api/mining/claim
// Errors show full stack trace during development
```

### Check Logs in Production

Use environment variable to control log level:
```env
LOG_LEVEL=debug  # verbose
LOG_LEVEL=info   # normal
LOG_LEVEL=warn   # warnings only
LOG_LEVEL=error  # errors only
```

### Browser DevTools

Open Telegram Mini App → **Browser DevTools** (F12):

- **Console** – See client-side errors/logs
- **Network** – Inspect API requests
- **Storage** → **Cookies** – Check JWT token

### Test Auth Locally

```bash
# Get a fake initData (for development)
# In your frontend, get: window.Telegram.WebApp.initData

curl -X POST http://localhost:3000/api/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{"initData": "..."}'
```

---

## Testing Endpoints

### Using curl

**Check if server is running:**
```bash
curl http://localhost:3000
```

**Authenticate:**
```bash
curl -X POST http://localhost:3000/api/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{"initData": "user=%7B%22id%22%3A123%7D&hash=..."}'
```

**Get JWT from response, then:**
```bash
# Cookie will be set automatically for subsequent calls
curl -b "jwt=<token>" http://localhost:3000/api/user/me
```

### Using Postman

1. **Create new request** → `GET` → `http://localhost:3000/api/user/me`
2. **Headers** tab → Add:
   - `Authorization: Bearer <jwt_token>` (if not using cookies)
   - Or let Postman manage cookies automatically
3. **Send**

### Quick Test Script

Create `test.sh`:

```bash
#!/bin/bash

BASE="http://localhost:3000"
INIT_DATA="user=%7B%22id%22%3A123%7D&hash=..."

# Authenticate
echo "=== Auth ==="
RESPONSE=$(curl -s -X POST $BASE/api/auth/telegram \
  -H "Content-Type: application/json" \
  -d "{\"initData\": \"$INIT_DATA\"}")
echo $RESPONSE | jq '.'

# Get Profile
echo "=== Get Profile ==="
curl -s $BASE/api/user/me | jq '.'

# Start Mining
echo "=== Start Mining ==="
curl -s -X POST $BASE/api/mining/start | jq '.'
```

```bash
chmod +x test.sh
./test.sh
```

---

## Common Tasks

### Add a New Endpoint

1. **Create route file** (if needed): `routes/newFeature.js`

```javascript
const express = require('express');
const router = express.Router();
const User = require('../models/User');

/**
 * GET /api/newFeature/data
 * Get some data for the user
 */
router.get('/data', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json({ success: true, data: user.someField });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

2. **Mount in `server.js`:**

```javascript
app.use('/api/newFeature', require('./routes/newFeature'));
```

3. **Test:**

```bash
curl http://localhost:3000/api/newFeature/data
```

### Modify User Rewards

In `routes/tasks.js` or wherever:

```javascript
// Give user points
user.points += 100;

// Give user tickets
user.bronzeTickets += 50;
user.silverTickets += 5;

// Update level
user.level = getUserLevel(user.points);

// Save
await user.save();
```

### Test Transaction Verification

In `utils/tonHandler.js`, add test mode:

```javascript
// For development, optionally skip TON verification
if (process.env.SKIP_TON_VERIFY === 'true') {
  return { ok: true, txRef: 'test_' + Date.now() };
}

// Then in .env
SKIP_TON_VERIFY=true
```

### Add a Scheduled Task

In `utils/notificationScheduler.js`:

```javascript
const cron = require('node-cron');

// Run every day at 10:00 AM UTC
cron.schedule('0 10 * * *', async () => {
  console.log('Running daily task...');
  // Your code here
});
```

### Reset Database (Caution!)

```bash
mongosh
> use hope
> db.users.deleteMany({})
> db.contestants.deleteMany({})
> db.keyvalues.deleteMany({})
> exit
```

---

## Troubleshooting

### "MONGODB_URI is not defined"

**Solution:**
```bash
# Check .env file exists and has MONGODB_URI
cat .env | grep MONGODB_URI

# If missing, add it
echo "MONGODB_URI=mongodb://localhost:27017/hope" >> .env
```

### "Cannot find module 'express'"

**Solution:**
```bash
npm install
npm start
```

### "Port 3000 already in use"

**Solution 1 – Use different port:**
```bash
PORT=3001 npm start
```

**Solution 2 – Kill process using port:**
```bash
# macOS/Linux
lsof -i :3000
kill -9 <PID>

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### "JWT_SECRET is not defined"

**Solution:**
```bash
# Generate random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Add to .env
JWT_SECRET=<generated_secret>
```

### "TON API timeout"

**Solution:**
```bash
# Ensure TON_API_URL is correct
echo $TON_API_URL

# Should be: https://tonapi.io/v2

# If slow, allow stale cache
TON_PRICE_STALE_TTL_MS=3600000  # 1 hour fallback
```

### "Auth fails with 'Invalid Telegram data'"

**Check:**
1. Is `BOT_TOKEN` correct?
2. Is `initData` fresh (< 1 day old)?
3. In dev mode, check timestamps in console logs

```javascript
// In routes/auth.js debug output
console.log('AUTH DATE:', authDate, 'NOW:', nowSec, 'AGE:', ageSec);
console.log('RECEIVED HASH:', hash);
console.log('CALCULATED HASH:', computedHash);
```

### "Transaction verification always fails"

**Check:**
1. Is `DEV_WALLET_ADDRESS` set correctly?
2. Is the transaction on TON **mainnet** (not testnet)?
3. Is the amount >= required USD equivalent?

```bash
# Test tx lookup
curl "https://tonapi.io/v2/blockchain/transactions/<txHash>" \
  -H "Authorization: Bearer <key>"
```

---

## Code Style

### ESLint (Optional)

```bash
npm install --save-dev eslint

# Create config
npx eslint --init

# Check files
npx eslint routes/ utils/

# Auto-fix
npx eslint routes/ utils/ --fix
```

### Naming Conventions

- **Files:** `camelCase.js` or `kebab-case.js`
- **Functions:** `camelCase()`
- **Classes:** `PascalCase`
- **Constants:** `UPPER_SNAKE_CASE`
- **Private methods:** prefix with `_privateMethod()`

### JSDoc Comments

```javascript
/**
 * Brief description of what the function does
 * @param {Type} paramName - Description of param
 * @returns {Type} Description of return value
 * @throws {Error} When something goes wrong
 * @example
 * myFunction(123); // returns 'abc'
 */
function myFunction(paramName) {
  // Implementation
}
```

---

## Performance Tips

### Monitor Query Performance

Add timing:
```javascript
router.get('/expensive', async (req, res) => {
  const start = Date.now();
  
  const users = await User.find({}).limit(1000);
  
  const elapsed = Date.now() - start;
  console.log(`Query took ${elapsed}ms`);
  
  res.json(users);
});
```

### Use Indexes

In `models/User.js`:
```javascript
UserSchema.index({ level: 1, points: -1 });  // For leaderboard
UserSchema.index({ invitedCount: -1 });      // For referral ranking
```

### Cache Expensive Operations

```javascript
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 600 }); // 10 min TTL

router.get('/leaderboard', async (req, res) => {
  const key = 'leaderboard_level_1';
  
  let data = cache.get(key);
  if (!data) {
    data = await User.find({level: 'Seeker'}).sort({xp: -1}).limit(100);
    cache.set(key, data);
  }
  
  res.json(data);
});
```

---

## Next Steps

1. **Read [README.md](./README.md)** for full API documentation
2. **Check [API_REFERENCE.md](./API_REFERENCE.md)** for quick endpoint lookup
3. **Review utility files** in `utils/` for common patterns
4. **Check route examples** in `routes/` for endpoint structure

---

**Happy coding! 🚀**
