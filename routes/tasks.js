// routes/tasks.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { verifyTransaction } = require('../utils/tonHandler');

/**
 * POST /api/tasks/daily-checkin
 * Body: { txHash }
 */
router.post('/daily-checkin', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'Missing transaction hash' });
    }

    const isValid = await verifyTransaction({
      telegramId,
      txHash,
      requiredUsd: 0.3
    });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid transaction' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.dailyCheckins = user.dailyCheckins || [];

    const alreadyChecked = user.dailyCheckins.some((d) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      return x.getTime() === today.getTime();
    });

    if (alreadyChecked) {
      return res.status(400).json({ error: 'Already checked in today' });
    }

    user.dailyCheckins.push(new Date());
    user.points += 100;

    await user.save();

    res.json({
      success: true,
      points: user.points
    });
  } catch (err) {
    console.error('Daily Check-in Error:', err);
    res.status(500).json({ error: 'Daily check-in failed' });
  }
});

/**
 * POST /api/tasks/complete
 * Body: { taskId }
 * For non-TON daily/social tasks that do not require proof
 */
router.post('/complete', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'Missing taskId' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.completedTasks = user.completedTasks || [];

    if (user.completedTasks.includes(taskId)) {
      return res.status(400).json({ error: 'Task already completed' });
    }

    user.completedTasks.push(taskId);
    user.points += 100;

    await user.save();

    res.json({
      success: true,
      points: user.points
    });
  } catch (err) {
    console.error('Complete Task Error:', err);
    res.status(500).json({ error: 'Task completion failed' });
  }
});

/**
 * POST /api/tasks/verify-proof
 * Multipart form with: proof (image), taskId
 */
router.post('/verify-proof', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { taskId } = req.body;

    if (!taskId) {
      return res.status(400).json({ error: 'Missing taskId' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.completedTasks = user.completedTasks || [];

    if (user.completedTasks.includes(taskId)) {
      return res.status(400).json({ error: 'Task already completed' });
    }

    // TODO:
    // - Save image
    // - Send to email: admin@yourdomain.com

    user.completedTasks.push(taskId);
    user.points += 200;

    await user.save();

    res.json({
      success: true,
      points: user.points
    });
  } catch (err) {
    console.error('Verify Proof Error:', err);
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * GET /api/tasks/definitions
 */
router.get('/definitions', (_, res) => {
  res.json({
    daily: [
      {
        id: 'daily-checkin',
        title: 'Daily Check-in',
        action: 'check-in',
        reward: 100,
        description: 'Start your day with a check-in',
        transactionRequired: true,
        feeUSD: 0.3
      },
      {
        id: 'play-puzzle',
        title: 'Play Puzzles',
        action: 'play',
        reward: 100,
        description: 'Solve today\'s puzzle'
      },
      {
        id: 'visit-telegram',
        title: 'Visit Telegram Channel',
        action: 'visit',
        reward: 100,
        description: 'Check our Telegram updates',
        url: 'https://t.me/yourchannel'
      },
      {
        id: 'twitter-engage',
        title: 'Like & Retweet Post',
        action: 'visit',
        reward: 100,
        description: 'Engage with our latest Tweet',
        url: 'https://twitter.com/yourpost'
      },
      {
        id: 'watch-youtube',
        title: 'Watch YouTube Video',
        action: 'visit',
        reward: 100,
        description: 'Watch our latest video',
        url: 'https://youtube.com/yourvideo'
      }
    ],
    oneTime: [
      {
        id: 'join-telegram',
        title: 'Subscribe to Telegram Channel',
        action: 'verify',
        reward: 200,
        description: 'Become a member',
        url: 'https://t.me/yourchannel'
      },
      {
        id: 'subscribe-youtube',
        title: 'Subscribe to YouTube',
        action: 'verify',
        reward: 200,
        description: 'Join our video hub',
        url: 'https://youtube.com/yourchannel'
      },
      {
        id: 'follow-twitter',
        title: 'Follow Twitter Handle',
        action: 'verify',
        reward: 200,
        description: 'Stay updated',
        url: 'https://twitter.com/yourhandle'
      },
      {
        id: 'join-group',
        title: 'Join Chat Group',
        action: 'verify',
        reward: 200,
        description: 'Meet the community',
        url: 'https://t.me/yourgroup'
      },
      {
        id: 'future-task',
        title: 'Special Mission',
        action: 'verify',
        reward: 200,
        description: 'Coming soon',
        comingSoon: true
      }
    ]
  });
});

module.exports = router;
