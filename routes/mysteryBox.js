const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { getUserLevel } = require('../utils/levelUtil');
const { verifyTransaction } = require('../utils/tonHandler');

const DAILY_LIMIT = 3;
const BOX_ORDER = ['bronze', 'silver', 'gold'];
const BOX_PRICE_USD = 0.15;

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getTodayBoxes(user) {
  const todayKey = getTodayKey();
  return (user.mysteryBoxes || []).filter((b) => getTodayKey(new Date(b.purchaseTime)) === todayKey);
}

function getRewardForBoxType(boxType) {
  if (boxType === 'bronze') return { points: 200, bronzeTickets: 10, xp: 1 };
  if (boxType === 'silver') return { points: 300, bronzeTickets: 20, xp: 2 };
  if (boxType === 'gold') return { points: 500, bronzeTickets: 20, silverTickets: 1, xp: 5 };
  return { points: 0, bronzeTickets: 0, silverTickets: 0, goldTickets: 0, xp: 0 };
}

function getBoxStatusPayload(user) {
  const todayBoxes = getTodayBoxes(user);
  const purchasedToday = todayBoxes.length;
  const nextBoxType = purchasedToday < DAILY_LIMIT ? BOX_ORDER[purchasedToday] : null;
  const activeBox = todayBoxes.find((b) => b.status === 'purchased') || null;

  return {
    purchasedToday,
    limit: DAILY_LIMIT,
    nextBoxType,
    todayBoxes: todayBoxes.map((b) => ({ boxType: b.boxType, status: b.status })),
    activeBox: activeBox ? {
      boxType: activeBox.boxType,
      status: activeBox.status,
      purchaseTime: activeBox.purchaseTime
    } : null
  };
}

router.get('/status', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, ...getBoxStatusPayload(user) });
  } catch (err) {
    console.error('Mystery box status error:', err);
    res.status(500).json({ error: 'Failed to load mystery box status' });
  }
});

router.post('/purchase', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { txHash, txBoc } = req.body || {};
    if (!txHash && !txBoc) return res.status(400).json({ error: 'Missing transaction proof' });

    const verification = await verifyTransaction({
      telegramId,
      txHash,
      txBoc,
      purpose: 'mystery-box-purchase',
      requiredUsd: BOX_PRICE_USD
    });

    if (!verification.ok) {
      return res.status(400).json({ error: verification.reason || 'Invalid or unverified payment' });
    }

    const proofRef = verification.txRef || txHash || txBoc;

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.mysteryBoxes = user.mysteryBoxes || [];

    const alreadyUsed = user.mysteryBoxes.some((b) => b.transactionId === proofRef);
    if (alreadyUsed) return res.status(400).json({ error: 'Transaction already used' });

    const todayBoxes = getTodayBoxes(user);
    if (todayBoxes.length >= DAILY_LIMIT) {
      return res.status(400).json({ error: 'Daily limit reached (3 boxes)' });
    }

    const hasPending = todayBoxes.some((b) => b.status === 'purchased');
    if (hasPending) {
      return res.status(400).json({ error: 'Open your current box before purchasing the next one' });
    }

    const boxType = BOX_ORDER[todayBoxes.length];

    user.mysteryBoxes.push({
      boxType,
      status: 'purchased',
      purchaseTime: new Date(),
      transactionId: proofRef
    });

    await user.save();

    res.json({
      success: true,
      message: `Purchased ${boxType} mystery box`,
      boxType,
      ...getBoxStatusPayload(user)
    });
  } catch (err) {
    console.error('Purchase Mystery Box Error:', err);
    res.status(500).json({ error: 'Failed to purchase mystery box' });
  }
});

router.post('/open', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const todayBoxes = getTodayBoxes(user);
    const box = todayBoxes.find((b) => b.status === 'purchased');
    if (!box) return res.status(400).json({ error: 'No purchased box available to open' });

    const reward = getRewardForBoxType(box.boxType);

    box.status = 'claimed';
    box.claimedAt = new Date();
    box.reward = reward;

    user.points = (user.points || 0) + (reward.points || 0);
    user.bronzeTickets = (user.bronzeTickets || 0) + (reward.bronzeTickets || 0);
    user.silverTickets = (user.silverTickets || 0) + (reward.silverTickets || 0);
    user.goldTickets = (user.goldTickets || 0) + (reward.goldTickets || 0);
    user.xp = (user.xp || 0) + (reward.xp || 0);
    user.level = getUserLevel(user.points || 0);

    await user.save();

    res.json({
      success: true,
      message: `${box.boxType.toUpperCase()} box opened`,
      boxType: box.boxType,
      reward,
      user: {
        points: user.points,
        bronzeTickets: user.bronzeTickets,
        silverTickets: user.silverTickets,
        goldTickets: user.goldTickets,
        xp: user.xp,
        level: user.level
      },
      ...getBoxStatusPayload(user)
    });
  } catch (err) {
    console.error('Open Mystery Box Error:', err);
    res.status(500).json({ error: 'Failed to open mystery box' });
  }
});

module.exports = router;
