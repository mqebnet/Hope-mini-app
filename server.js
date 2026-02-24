//server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const TelegramBot = require('node-telegram-bot-api');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const User = require('./models/User');
const { getUserLevel } = require('./utils/levelUtil');
const referralRouter = require('./routes/referral');
const leaderboardRouter = require('./routes/leaderboard');
const tasksRouter = require('./routes/tasks');
const dailyCheckInRouter = require('./routes/dailyCheckIn');
const userRouter = require('./routes/user');
const MINING_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

const app = express();
app.set('trust proxy', 1);

app.use((req, _, next) => {
  console.log(`➡️ ${req.method} ${req.path}`);
  next();
});

// ==================== Database Connection ====================
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in .env file');
  process.exit(1);
}
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.stack);
    process.exit(1);
  }
};

// ==================== Middleware ====================
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://529c-197-211-63-6.ngrok-free.app',
    'https://web.telegram.org',
    'https://connect.tonhubapi.com' // TON
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'telegram-init-data']
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later'
});
app.use('/api/', limiter);

// Static first
app.use(express.static(path.join(__dirname, 'public')));

// Public routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/test-login', require('./routes/test-login'));

// Page protection
app.get('/', require('./middleware/pageAuth'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/auth', (_, res) => {
  res.sendFile(path.join(__dirname, 'public/auth.html'));
});

// API protection
app.use('/api', require('./middleware/apiAuth'));

// APIs
app.use('/api/me', require('./routes/me'));
app.use('/api/user', userRouter);
app.use('/api/tasks', tasksRouter);


// Explicit route handlers
app.get('/', (req, res) => {
  if (req.user?.telegramId) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

app.get('/auth', (_, res) => {
  res.sendFile(path.join(__dirname, 'public', 'auth.html'));
});

// ==================== Core Endpoints ====================

// Mining Endpoints
app.post('/api/start-mining', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.miningStartedAt) {
      return res.status(400).json({ error: 'Mining already active' });
    }

    user.miningStartedAt = new Date();
    await user.save();

    res.json({
      success: true,
      miningStartedAt: user.miningStartedAt,
      durationMs: MINING_DURATION_MS
    });
  } catch (err) {
    console.error('Start mining error:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/claim-mining', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user || !user.miningStartedAt) {
      return res.status(400).json({ error: 'No active mining' });
    }

    const elapsed = Date.now() - user.miningStartedAt.getTime();
    if (elapsed < MINING_DURATION_MS) {
      return res.status(403).json({ error: 'Mining not complete' });
    }

    user.points += 250;
    user.miningStartedAt = null;
    user.lastMiningClaim = new Date();
    user.level = getUserLevel(user.points);

    await user.save();

    res.json({
      success: true,
      points: user.points,
      level: user.level
    });
  } catch (err) {
    console.error('Claim mining error:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ==================== Route Mounting ====================


app.use('/api/referral', referralRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/user', userRouter);
app.use('/api/exchangeTickets', require('./routes/exchangeTickets'));
app.use('/api/mysteryBox', require('./routes/mysteryBox'));
app.use('/api/puzzles', require('./routes/puzzles'));
// Legacy daily check-in (deprecated, kept for backward compatibility)
app.use('/api/dailyCheckIn', dailyCheckInRouter);

const routes = [ 
  'weeklyDrop', 'rewards', 'tonAmount', 'invite'
];

routes.forEach(route => {
  try {
    const router = require(`./routes/${route}`);
    app.use(`/api/${route}`, router);
    console.log(`✅ Mounted /api/${route} routes`);
  } catch (err) {
    console.error(`❌ Failed to load ${route} routes:`, err);
  }
});

// ==================== Error Handling ====================

// Redirect unauthenticated users
app.use((_, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.stack}`);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== Server Startup ====================
const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    
    // Initialize Telegram bot if token exists
    if (process.env.ENABLE_BOT === 'true') {
  const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
}

  });
});