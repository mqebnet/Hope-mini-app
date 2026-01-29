// routes/mysteryBox.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getUserLevel } = require('../utils/levelUtil');
const { verifyTonPayment } = require('../utils/tonHandler');

function getToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * POST /api/mysteryBox/purchase
 * Body:
 * {
 *   txHash: String   // TON tx paying required USDT
 * }
 */
router.post('/purchase', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { txHash } = req.body;

    if (!txHash) {
      return res.status(400).json({ error: 'Missing transaction hash' });
    }

    const paid = await verifyTonPayment(
      txHash,
      0.1,
      process.env.TON_WALLET_ADDRESS
    );

    if (!paid) {
      return res.status(400).json({ error: 'Invalid or unverified payment' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.mysteryBoxes = user.mysteryBoxes || [];
    const today = getToday();

    const todayBoxes = user.mysteryBoxes.filter(b => {
      const d = new Date(b.purchaseTime);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });

    if (todayBoxes.length >= 3) {
      return res.status(400).json({ error: 'Daily limit reached' });
    }

    const order = ['bronze', 'silver', 'gold'];
    const nextBoxType = order[todayBoxes.length];

    user.mysteryBoxes.push({
      boxType: nextBoxType,
      status: 'purchased',
      purchaseTime: new Date(),
      txHash
    });

    await user.save();

    res.json({ message: `Purchased ${nextBoxType} mystery box.` });
  } catch (err) {
    console.error('Purchase Mystery Box Error:', err);
    res.status(500).json({ error: 'Failed to purchase mystery box' });
  }
});

/**
 * POST /api/mysteryBox/open
 */
router.post('/open', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.mysteryBoxes = user.mysteryBoxes || [];
    const box = user.mysteryBoxes.find(b => b.status === 'purchased');

    if (!box) {
      return res.status(400).json({ error: 'No box to open' });
    }

    const memeCoins = [
      'doge','pepe','ponke','shiba','floki','bonk','notcoin','brett','popcat'
    ];

    const meme = memeCoins[Math.floor(Math.random() * memeCoins.length)];

    box.status = 'opened';
    box.puzzle = {
      meme,
      totalPieces: 16,
      openedAt: new Date()
    };

    await user.save();

    res.json({
      message: 'Box opened',
      puzzle: box.puzzle,
      boxType: box.boxType,
      timer: 120
    });
  } catch (err) {
    console.error('Open Mystery Box Error:', err);
    res.status(500).json({ error: 'Failed to open mystery box' });
  }
});

/**
 * POST /api/mysteryBox/claim
 */
router.post('/claim', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const box = (user.mysteryBoxes || []).find(b => b.status === 'opened');
    if (!box) {
      return res.status(400).json({ error: 'No opened box' });
    }

    const elapsed = Date.now() - new Date(box.puzzle.openedAt).getTime();
    if (elapsed > 120000) {
      return res.status(400).json({ error: 'Puzzle expired' });
    }

    let reward;
    if (box.boxType === 'bronze') reward = { points: 200, bronzeTickets: 10, xp: 1 };
    if (box.boxType === 'silver') reward = { points: 300, bronzeTickets: 20, xp: 2 };
    if (box.boxType === 'gold')   reward = { points: 500, bronzeTickets: 20, silverTickets: 1, xp: 5 };

    box.status = 'claimed';
    await user.save();

    const updatedUser = await User.findOneAndUpdate(
      { telegramId },
      { $inc: reward },
      { new: true }
    );

    const newLevel = getUserLevel(updatedUser.points);
    if (updatedUser.level !== newLevel) {
      updatedUser.level = newLevel;
      await updatedUser.save();
    }

    res.json({
      message: 'Rewards claimed',
      rewards: reward,
      user: {
        points: updatedUser.points,
        bronzeTickets: updatedUser.bronzeTickets,
        silverTickets: updatedUser.silverTickets,
        xp: updatedUser.xp,
        level: updatedUser.level
      }
    });
  } catch (err) {
    console.error('Claim Mystery Box Error:', err);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

module.exports = router;
