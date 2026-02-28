const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const User = require('../models/User');
const { getUserLevel } = require('../utils/levelUtil');
const { verifyTonPayment } = require('../utils/tonHandler');

const DAILY_LIMIT = 3;
const BOX_ORDER = ['bronze', 'silver', 'gold'];
const PUZZLE_PIECES = 10;
const PUZZLE_TIMER_SECONDS = 60;
const MIN_SOLVE_SECONDS = 8;
const MAX_SOLVE_ATTEMPTS = 8;

const MEME_COINS = [
  { key: 'dogecoin', name: 'Doge coin', imageUrl: 'https://cryptologos.cc/logos/dogecoin-doge-logo.png?v=040' },
  { key: 'pepe', name: 'Pepe', imageUrl: 'https://cryptologos.cc/logos/pepe-pepe-logo.png?v=040' },
  { key: 'ponke', name: 'Ponke', imageUrl: 'https://assets.coingecko.com/coins/images/36867/large/ponke.jpeg' },
  { key: 'shiba-inu', name: 'Shiba inu', imageUrl: 'https://cryptologos.cc/logos/shiba-inu-shib-logo.png?v=040' },
  { key: 'floki', name: 'Floki', imageUrl: 'https://cryptologos.cc/logos/floki-inu-floki-logo.png?v=040' },
  { key: 'popcat', name: 'Popcat', imageUrl: 'https://assets.coingecko.com/coins/images/33760/large/Popcat_logo.png' },
  { key: 'pudgy-penguins', name: 'Pengu', imageUrl: 'https://assets.coingecko.com/coins/images/52622/large/Pengu_PFP.png' },
  { key: 'bonk', name: 'Bonk', imageUrl: 'https://cryptologos.cc/logos/bonk-bonk-logo.png?v=040' },
  { key: 'brett', name: 'Brett', imageUrl: 'https://assets.coingecko.com/coins/images/35529/large/1000050750.png' },
  { key: 'dogwifhat', name: 'Dogwifhat', imageUrl: 'https://cryptologos.cc/logos/dogwifhat-wif-logo.png?v=040' },
  { key: 'slerf', name: 'Slerf', imageUrl: 'https://assets.coingecko.com/coins/images/37784/large/slerf.jpg' },
  { key: 'wen', name: 'Wen', imageUrl: 'https://assets.coingecko.com/coins/images/35047/large/wen.png' },
  { key: 'maneki', name: 'Maneki', imageUrl: 'https://assets.coingecko.com/coins/images/37035/large/MANEKI_200.png' },
  { key: 'notcoin', name: 'Notcoin', imageUrl: 'https://cryptologos.cc/logos/notcoin-not-logo.png?v=040' },
  { key: 'turbo', name: 'Turbo', imageUrl: 'https://cryptologos.cc/logos/turbo-turbo-logo.png?v=040' },
  { key: 'peanut-the-squirrel', name: 'PNUT', imageUrl: 'https://assets.coingecko.com/coins/images/51144/large/Pnut.jpg' },
  { key: 'dogs', name: 'Dogs', imageUrl: 'https://assets.coingecko.com/coins/images/39157/large/dogs.jpg' },
  { key: 'mumu-the-bull-3', name: 'Mumu', imageUrl: 'https://assets.coingecko.com/coins/images/39858/large/mumu.png' },
  { key: 'fwog', name: 'Fwog', imageUrl: 'https://assets.coingecko.com/coins/images/38947/large/frog.png' },
  { key: 'simons-cat', name: "Simon's cat", imageUrl: 'https://assets.coingecko.com/coins/images/51678/large/simons-cat.jpeg' }
];

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildPuzzleConfig(meme) {
  const sourceIndexes = Array.from({ length: PUZZLE_PIECES }, (_, i) => i);
  const pieceEntries = sourceIndexes.map((sourceIndex) => ({
    pieceId: crypto.randomBytes(6).toString('hex'),
    sourceIndex
  }));
  const piecePool = shuffle(pieceEntries);
  const solution = [...pieceEntries]
    .sort((a, b) => a.sourceIndex - b.sourceIndex)
    .map((p) => p.pieceId);

  return {
    meme: meme.name,
    imageUrl: meme.imageUrl,
    totalPieces: PUZZLE_PIECES,
    openedAt: new Date(),
    sessionId: crypto.randomUUID(),
    pieces: piecePool,
    solution,
    attempts: 0,
    solved: false
  };
}

function serializePuzzle(puzzle) {
  if (!puzzle) return null;
  return {
    meme: puzzle.meme,
    imageUrl: puzzle.imageUrl,
    totalPieces: puzzle.totalPieces,
    openedAt: puzzle.openedAt,
    sessionId: puzzle.sessionId,
    solved: Boolean(puzzle.solved),
    pieces: Array.isArray(puzzle.pieces)
      ? puzzle.pieces.map((p) => ({
          pieceId: p.pieceId,
          sourceIndex: p.sourceIndex
        }))
      : []
  };
}

function getTodayBoxes(user) {
  const todayKey = getTodayKey();
  return (user.mysteryBoxes || []).filter((b) => getTodayKey(new Date(b.purchaseTime)) === todayKey);
}

function normalizeExpiredOpenedBox(user) {
  let changed = false;
  const now = Date.now();
  const todayBoxes = getTodayBoxes(user);
  todayBoxes.forEach((box) => {
    if (box.status !== 'opened' || !box.puzzle?.openedAt) return;
    const elapsed = now - new Date(box.puzzle.openedAt).getTime();
    if (elapsed > PUZZLE_TIMER_SECONDS * 1000) {
      box.status = 'claimed';
      changed = true;
    }
  });
  return changed;
}

function canUseDevDebugEndpoint() {
  return process.env.NODE_ENV !== 'production';
}

function serializePuzzleDebug(puzzle, { includeSolution = false } = {}) {
  if (!puzzle) return null;
  const base = {
    meme: puzzle.meme,
    imageUrl: puzzle.imageUrl,
    totalPieces: puzzle.totalPieces,
    openedAt: puzzle.openedAt,
    sessionId: puzzle.sessionId,
    attempts: Number(puzzle.attempts || 0),
    solved: Boolean(puzzle.solved),
    solvedAt: puzzle.solvedAt || null,
    pieces: Array.isArray(puzzle.pieces)
      ? puzzle.pieces.map((p) => ({
          pieceId: p.pieceId,
          sourceIndex: p.sourceIndex
        }))
      : []
  };
  if (includeSolution) {
    base.solution = Array.isArray(puzzle.solution) ? puzzle.solution : [];
  }
  return base;
}

router.get('/dev/today', async (req, res) => {
  try {
    if (!canUseDevDebugEndpoint()) {
      return res.status(404).json({ error: 'Not found' });
    }

    const queryTelegramId = Number.parseInt(req.query.telegramId, 10);
    const targetTelegramId = Number.isFinite(queryTelegramId) ? queryTelegramId : req.user.telegramId;
    const includeSolution = req.query.includeSolution === '1' || req.query.includeSolution === 'true';

    const user = await User.findOne({ telegramId: targetTelegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (normalizeExpiredOpenedBox(user)) await user.save();
    const todayBoxes = getTodayBoxes(user);

    res.json({
      success: true,
      env: process.env.NODE_ENV || 'development',
      telegramId: targetTelegramId,
      todayKey: getTodayKey(),
      count: todayBoxes.length,
      limit: DAILY_LIMIT,
      status: getBoxStatusPayload(user),
      boxes: todayBoxes.map((b) => ({
        id: String(b._id),
        boxType: b.boxType,
        status: b.status,
        purchaseTime: b.purchaseTime,
        transactionId: b.transactionId || null,
        puzzle: serializePuzzleDebug(b.puzzle, { includeSolution })
      }))
    });
  } catch (err) {
    console.error('Mystery box debug endpoint error:', err);
    res.status(500).json({ error: 'Failed to fetch mystery box debug data' });
  }
});

function getBoxStatusPayload(user) {
  const todayBoxes = getTodayBoxes(user);
  const purchasedToday = todayBoxes.length;
  const nextBoxType = purchasedToday < DAILY_LIMIT ? BOX_ORDER[purchasedToday] : null;
  const activeBox = todayBoxes.find((b) => b.status === 'opened') || todayBoxes.find((b) => b.status === 'purchased') || null;
  return {
    purchasedToday,
    limit: DAILY_LIMIT,
    nextBoxType,
    todayBoxes: todayBoxes.map((b) => ({ boxType: b.boxType, status: b.status })),
    activeBox: activeBox ? {
      boxType: activeBox.boxType,
      status: activeBox.status,
      purchaseTime: activeBox.purchaseTime,
      puzzle: serializePuzzle(activeBox.puzzle)
    } : null
  };
}

router.get('/status', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (normalizeExpiredOpenedBox(user)) await user.save();
    res.json({ success: true, ...getBoxStatusPayload(user) });
  } catch (err) {
    console.error('Mystery box status error:', err);
    res.status(500).json({ error: 'Failed to load mystery box status' });
  }
});

router.post('/purchase', async (req, res) => {
  try {
    const telegramId = req.user.telegramId;
    const { txHash } = req.body;
    if (!txHash) return res.status(400).json({ error: 'Missing transaction hash' });

    const recipient = process.env.DEV_WALLET_ADDRESS || process.env.TON_WALLET_ADDRESS;
    const paid = await verifyTonPayment(txHash, 0.1, recipient);
    if (!paid) return res.status(400).json({ error: 'Invalid or unverified payment' });

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.mysteryBoxes = user.mysteryBoxes || [];
    if (normalizeExpiredOpenedBox(user)) await user.save();

    const alreadyUsed = user.mysteryBoxes.some((b) => b.transactionId === txHash);
    if (alreadyUsed) return res.status(400).json({ error: 'Transaction already used' });

    const todayBoxes = getTodayBoxes(user);
    if (todayBoxes.length >= DAILY_LIMIT) {
      return res.status(400).json({ error: 'Daily limit reached (3 boxes)' });
    }

    const boxType = BOX_ORDER[todayBoxes.length];
    user.mysteryBoxes.push({
      boxType,
      status: 'purchased',
      purchaseTime: new Date(),
      transactionId: txHash
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
    if (normalizeExpiredOpenedBox(user)) await user.save();

    const todayBoxes = getTodayBoxes(user);
    const opened = todayBoxes.find((b) => b.status === 'opened');
    const box = opened || todayBoxes.find((b) => b.status === 'purchased');
    if (!box) return res.status(400).json({ error: 'No box available to open' });

    const meme = MEME_COINS[Math.floor(Math.random() * MEME_COINS.length)];
    if (!opened) {
      box.status = 'opened';
      box.puzzle = buildPuzzleConfig(meme);
      await user.save();
    }

    res.json({
      success: true,
      boxType: box.boxType,
      puzzle: serializePuzzle(box.puzzle),
      timerSeconds: PUZZLE_TIMER_SECONDS,
      pieces: PUZZLE_PIECES
    });
  } catch (err) {
    console.error('Open Mystery Box Error:', err);
    res.status(500).json({ error: 'Failed to open mystery box' });
  }
});

router.post('/solve', async (req, res) => {
  try {
    const { arrangement, sessionId } = req.body || {};
    if (!Array.isArray(arrangement) || arrangement.length !== PUZZLE_PIECES) {
      return res.status(400).json({ error: 'Invalid arrangement' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Missing puzzle session' });
    }

    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (normalizeExpiredOpenedBox(user)) await user.save();

    const box = getTodayBoxes(user).find((b) => b.status === 'opened');
    if (!box || !box.puzzle?.openedAt) {
      return res.status(400).json({ error: 'No opened puzzle found' });
    }

    if (box.puzzle.solved) {
      return res.status(400).json({ error: 'Puzzle already solved' });
    }
    if (box.puzzle.sessionId !== sessionId) {
      return res.status(400).json({ error: 'Invalid puzzle session' });
    }

    const elapsed = Date.now() - new Date(box.puzzle.openedAt).getTime();
    if (elapsed > PUZZLE_TIMER_SECONDS * 1000) {
      return res.status(400).json({ error: 'Puzzle time expired' });
    }
    if (elapsed < MIN_SOLVE_SECONDS * 1000) {
      return res.status(400).json({ error: 'Solve too fast. Keep playing.' });
    }

    box.puzzle.attempts = Number(box.puzzle.attempts || 0) + 1;
    if (box.puzzle.attempts > MAX_SOLVE_ATTEMPTS) {
      await user.save();
      return res.status(400).json({ error: 'Too many solve attempts' });
    }

    const normalized = arrangement.map((v) => String(v));
    const uniqueCount = new Set(normalized).size;
    if (uniqueCount !== PUZZLE_PIECES) {
      await user.save();
      return res.status(400).json({ error: 'Invalid arrangement data' });
    }

    const expected = Array.isArray(box.puzzle.solution) ? box.puzzle.solution : [];
    const solved = expected.length === PUZZLE_PIECES && expected.every((pieceId, i) => normalized[i] === pieceId);
    if (!solved) {
      await user.save();
      return res.status(400).json({ error: 'Puzzle is not solved correctly' });
    }

    box.puzzle.solved = true;
    box.puzzle.solvedAt = new Date();
    await user.save();
    res.json({ success: true, message: 'Puzzle solved' });
  } catch (err) {
    console.error('Solve Mystery Box Error:', err);
    res.status(500).json({ error: 'Failed to verify puzzle solve' });
  }
});

router.post('/claim', async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (normalizeExpiredOpenedBox(user)) await user.save();

    const box = getTodayBoxes(user).find((b) => b.status === 'opened');
    if (!box || !box.puzzle?.openedAt) return res.status(400).json({ error: 'No opened box to claim' });

    const elapsed = Date.now() - new Date(box.puzzle.openedAt).getTime();
    if (elapsed > PUZZLE_TIMER_SECONDS * 1000) {
      return res.status(400).json({ error: 'Puzzle expired' });
    }
    if (!box.puzzle?.solved) {
      return res.status(400).json({ error: 'Solve puzzle first before claiming reward' });
    }

    let reward;
    if (box.boxType === 'bronze') reward = { points: 200, bronzeTickets: 10, xp: 1 };
    if (box.boxType === 'silver') reward = { points: 300, bronzeTickets: 20, xp: 2 };
    if (box.boxType === 'gold') reward = { points: 500, bronzeTickets: 20, silverTickets: 1, xp: 5 };

    box.status = 'claimed';
    user.points = (user.points || 0) + (reward.points || 0);
    user.bronzeTickets = (user.bronzeTickets || 0) + (reward.bronzeTickets || 0);
    user.silverTickets = (user.silverTickets || 0) + (reward.silverTickets || 0);
    user.xp = (user.xp || 0) + (reward.xp || 0);
    user.level = getUserLevel(user.points);
    await user.save();

    res.json({
      success: true,
      message: 'Rewards claimed',
      rewards: reward,
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
    console.error('Claim Mystery Box Error:', err);
    res.status(500).json({ error: 'Failed to claim reward' });
  }
});

module.exports = router;
