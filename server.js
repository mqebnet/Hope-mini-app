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
const MINING_DURATION_MS = 60 * 60 * 1000;

const app = express();
app.set('trust proxy', 1);

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
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
};

// ==================== Middleware ====================
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://86035ae134b2.ngrok-free.app',
    'https://web.telegram.org',
    'https://connect.tonhubapi.com' // Add TON Connect domains
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
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



// Static files with security headers
app.use(express.static(path.join(__dirname, 'public'), {
  index: false, // Disable automatic index.html serving
  setHeaders: (res, path) => {
    if (path.endsWith('auth.html')) {
      res.set('Cache-Control', 'no-store');
    }
    res.set('X-Content-Type-Options', 'nosniff');
  }
}));
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

// ==================== Security Helpers ====================
function checkSignature(initData) {
  if (!initData) return false;
  
  const botToken = process.env.BOT_TOKEN;
  if (!botToken) {
    console.error('BOT_TOKEN is not set in .env file');
    return false;
  }

  try {
    const parsedData = new URLSearchParams(initData);
    const hash = parsedData.get('hash');
    if (!hash) return false;

    parsedData.delete('hash');
    const dataCheckString = Array.from(parsedData.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return calculatedHash === hash;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// ==================== Core Endpoints ====================
// ==================== Updated Authentication Middleware ====================
const authenticate = (req, res, next) => {
  const publicPaths = [
    '/auth',
    '/api/auth/telegram',
    '/api/test-login',
    '/styles.css',
    '/auth.js',
    '/tonconnect-manifest.json'
  ];

  if (publicPaths.some(p => req.path.startsWith(p))) {
    return next();
  }

  const token =
    req.cookies?.jwt ||
    req.headers.authorization?.split(' ')[1];

  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
      return next();
    } catch {}
  }

  const tgData =
    req.headers['telegram-init-data'] ||
    req.query.tgData;

  if (tgData && checkSignature(tgData)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
};

// User Authentication
app.post('/api/auth/telegram', async (req, res) => {
  try {
    const { initData } = req.body;
    if (!checkSignature(initData)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Invalid Telegram data' 
      });
    }

    const parsedData = new URLSearchParams(initData);
    const telegramId = parsedData.get('user.id');
    if (!telegramId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID not found' 
      });
    }

    // Find or create user
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = new User({
        telegramId,
        username: parsedData.get('user.username') || `user_${telegramId}`,
        firstName: parsedData.get('user.first_name'),
        lastName: parsedData.get('user.last_name'),
        points: 0,
        streak: 0,
        xp:     0,
        level: "Seeker",
        bronzeTickets: 0,
        silverTickets: 0,
        goldTickets: 0
      });
      await user.save();
    }

    // Create JWT token
    const token = jwt.sign(
      { telegramId: user.telegramId }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );

    res.cookie('jwt', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    }).json({ 
      success: true,
      token:token,
      user: {
        id: user.telegramId,
        username: user.username,
        points: user.points,
        level: user.level,
        xp: user.xp,
        streak: user.streak
      }
    });
  } catch (error) {
    console.error('Authentication Error:', error);
    console.log('INIT DATA RECEIVED:', initData);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/test-login', require('./routes/test-login'));

// Apply middleware before static files
app.use('/api', authenticate);


// User Data Endpoint


// Mining Claim Endpoint
app.post('/api/start-mining', async (req, res) => {
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
    durationMs: 60 * 60 * 1000
  });
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
  } catch (error) {
    console.error('Mining Claim Error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
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