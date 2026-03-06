//server.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');

const referralRouter = require('./routes/referral');
const leaderboardRouter = require('./routes/leaderboard');
const tasksRouter = require('./routes/tasks');
const dailyCheckInRouter = require('./routes/dailyCheckIn');
const userRouter = require('./routes/user');
const miningRouter = require('./routes/mining');
const adminAuth = require('./middleware/adminAuth');
const { startNotificationScheduler } = require('./utils/notificationScheduler');

const app = express();
app.set('trust proxy', 1);
app.set('etag', false);

app.use((req, _, next) => {
  console.log(`[REQ] ${req.method} ${req.path}`);
  next();
});

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not defined in .env file');
  process.exit(1);
}

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err.stack);
    process.exit(1);
  }
};

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'telegram-init-data']
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later'
});
app.use('/api/', limiter);

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.html') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// API responses should not be cached/revalidated in WebView.
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use('/api/auth', require('./routes/auth'));

app.get('/', require('./middleware/pageAuth'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/auth', (_, res) => {
  res.sendFile(path.join(__dirname, 'public/auth.html'));
});
app.get('/admin', require('./middleware/pageAuth'), adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

app.use('/api', require('./middleware/apiAuth'));

app.use('/api/me', require('./routes/me'));
app.use('/api/user', userRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/referral', referralRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/mining', miningRouter);
app.use('/api/exchangeTickets', require('./routes/exchangeTickets'));
app.use('/api/mysteryBox', require('./routes/mysteryBox'));
app.use('/api/boxes', require('./routes/boxes'));
app.use('/api/dailyCheckIn', dailyCheckInRouter);
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/admin', adminAuth, require('./routes/admin'));
app.use('/api/games', require('./routes/games'));

const routes = ['weeklyDrop', 'rewards', 'tonAmount', 'invite'];
routes.forEach((route) => {
  try {
    const router = require(`./routes/${route}`);
    app.use(`/api/${route}`, router);
    console.log(`Mounted /api/${route} routes`);
  } catch (err) {
    console.error(`Failed to load ${route} routes:`, err.message);
  }
});

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

const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  startNotificationScheduler();
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
      console.error(`Stop the existing process on ${PORT} or run with a different port (e.g. set PORT=3001).`);
      process.exit(1);
      return;
    }
    if (err.code === 'EACCES') {
      console.error(`Permission denied for port ${PORT}. Try a non-privileged port.`);
      process.exit(1);
      return;
    }
    console.error('Server startup error:', err);
    process.exit(1);
  });
});


