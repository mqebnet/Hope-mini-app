const User = require('../../../models/User');
const MysteryBox = require('../../../models/MysteryBox');
const { getUserLevel } = require('../../../utils/levelUtil');
const { verifyTransaction } = require('../../../utils/tonHandler');
const { GameEngineError } = require('../GameEngine');

const DAILY_LIMIT = 3;
const BOX_ORDER = ['bronze', 'silver', 'gold'];
const BOX_PRICE_USD = 0.15;

function getTelegramId(ctx) {
  const value = ctx?.user?.telegramId ?? ctx?.telegramId ?? null;
  const telegramId = Number(value);
  if (!Number.isFinite(telegramId)) throw new GameEngineError('Unauthorized', 401);
  return telegramId;
}

function getTodayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getTodayRange(date = new Date()) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function getTodayBoxes(boxes) {
  const todayKey = getTodayKey();
  return (boxes || []).filter((b) => getTodayKey(new Date(b.purchaseTime)) === todayKey);
}

function getRewardForBoxType(boxType) {
  if (boxType === 'bronze') return { points: 200, bronzeTickets: 10, xp: 1 };
  if (boxType === 'silver') return { points: 300, bronzeTickets: 20, xp: 2 };
  if (boxType === 'gold') return { points: 500, bronzeTickets: 20, silverTickets: 1, xp: 5 };
  return { points: 0, bronzeTickets: 0, silverTickets: 0, goldTickets: 0, xp: 0 };
}

function statusPayload(todayBoxes) {
  const purchasedToday = todayBoxes.length;
  const nextBoxType = purchasedToday < DAILY_LIMIT ? BOX_ORDER[purchasedToday] : null;
  const activeBox = todayBoxes.find((b) => b.status === 'purchased') || null;

  return {
    success: true,
    purchasedToday,
    limit: DAILY_LIMIT,
    boxPriceUsd: BOX_PRICE_USD,
    nextBoxType,
    todayBoxes: todayBoxes.map((b) => ({ boxType: b.boxType, status: b.status })),
    activeBox: activeBox
      ? { boxType: activeBox.boxType, status: activeBox.status, purchaseTime: activeBox.purchaseTime }
      : null
  };
}

module.exports = {
  id: 'mystery-box',
  version: '1.0.0',
  meta: {
    name: 'Mystery Box',
    description: 'Buy and open daily mystery boxes for instant rewards.',
    icon: '🎁',
    type: 'chance',
    category: 'games',
    entryFeeUsd: BOX_PRICE_USD
  },

  async getStatus(ctx) {
    const telegramId = getTelegramId(ctx);
    const user = await User.findOne({ telegramId });
    if (!user) throw new GameEngineError('User not found', 404);
    const { start, end } = getTodayRange();
    const todayBoxes = await MysteryBox.find({
      telegramId,
      purchaseTime: { $gte: start, $lt: end }
    }).sort({ purchaseTime: 1 }).lean();
    return statusPayload(todayBoxes);
  },

  async start(ctx) {
    // Opening the game UI just returns status and rules/config.
    return this.getStatus(ctx);
  },

  async purchase(ctx, payload = {}) {
    const telegramId = getTelegramId(ctx);
    const { txHash, txBoc } = payload;
    if (!txHash && !txBoc) throw new GameEngineError('Missing transaction proof', 400);

    const verification = await verifyTransaction({
      telegramId,
      txHash,
      txBoc,
      purpose: 'mystery-box-purchase',
      requiredUsd: BOX_PRICE_USD
    });
    if (!verification.ok) {
      throw new GameEngineError(verification.reason || 'Invalid or unverified payment', 400);
    }

    const proofRef = verification.txRef || txHash || txBoc;
    const user = await User.findOne({ telegramId });
    if (!user) throw new GameEngineError('User not found', 404);
    const alreadyUsed = await MysteryBox.exists({ transactionId: proofRef });
    if (alreadyUsed) throw new GameEngineError('Transaction already used', 400);

    const { start, end } = getTodayRange();
    const todayBoxes = await MysteryBox.find({
      telegramId,
      purchaseTime: { $gte: start, $lt: end }
    }).sort({ purchaseTime: 1 }).lean();
    if (todayBoxes.length >= DAILY_LIMIT) {
      throw new GameEngineError('Daily limit reached (3 boxes)', 400);
    }
    const hasPending = todayBoxes.some((b) => b.status === 'purchased');
    if (hasPending) {
      throw new GameEngineError('Open your current box before purchasing the next one', 400);
    }

    const boxType = BOX_ORDER[todayBoxes.length];
    await MysteryBox.create({
      telegramId,
      boxType,
      status: 'purchased',
      purchaseTime: new Date(),
      transactionId: proofRef
    });

    const updatedTodayBoxes = await MysteryBox.find({
      telegramId,
      purchaseTime: { $gte: start, $lt: end }
    }).sort({ purchaseTime: 1 }).lean();
    return {
      ...statusPayload(updatedTodayBoxes),
      message: `Purchased ${boxType} mystery box`,
      boxType
    };
  },

  async claim(ctx) {
    const telegramId = getTelegramId(ctx);
    const user = await User.findOne({ telegramId });
    if (!user) throw new GameEngineError('User not found', 404);
    const { start, end } = getTodayRange();
    const box = await MysteryBox.findOne({
      telegramId,
      status: 'purchased',
      purchaseTime: { $gte: start, $lt: end }
    }).sort({ purchaseTime: 1 });
    if (!box) throw new GameEngineError('No purchased box available to open', 400);

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

    await Promise.all([box.save(), user.save()]);

    const todayBoxes = await MysteryBox.find({
      telegramId,
      purchaseTime: { $gte: start, $lt: end }
    }).sort({ purchaseTime: 1 }).lean();

    return {
      ...statusPayload(todayBoxes),
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
      }
    };
  }
};
