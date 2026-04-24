const { GameEngineError } = require('../GameEngine');

function getTelegramId(ctx) {
  const value = ctx?.user?.telegramId ?? ctx?.telegramId ?? null;
  const telegramId = Number(value);
  if (!Number.isFinite(telegramId)) throw new GameEngineError('Unauthorized', 401);
  return telegramId;
}

module.exports = {
  id: 'treasure-hunt',
  version: '0.1.0',
  meta: {
    name: 'Treasure Hunt',
    description: 'Follow clues, unlock zones, and discover hidden reward chests.',
    icon: '🗺️',
    type: 'adventure',
    category: 'games',
    entryFeeUsd: 0,
    status: 'coming-soon'
  },

  async start(ctx, payload = {}) {
    getTelegramId(ctx);
    return {
      success: true,
      gameId: 'treasure-hunt',
      status: 'coming-soon',
      message: 'Treasure Hunt scaffold is ready. Add map/clue state + checkpoint validation to go live.',
      config: {
        mapId: payload.mapId || 'default-map',
        timeLimitSeconds: Number(payload.timeLimitSeconds || 120)
      }
    };
  },

  async move(ctx) {
    getTelegramId(ctx);
    throw new GameEngineError('Treasure Hunt move handler not implemented yet', 501);
  },

  async complete(ctx) {
    getTelegramId(ctx);
    throw new GameEngineError('Treasure Hunt complete handler not implemented yet', 501);
  },

  async getSession(ctx) {
    getTelegramId(ctx);
    throw new GameEngineError('Treasure Hunt session handler not implemented yet', 501);
  },

  async abandon(ctx) {
    getTelegramId(ctx);
    return { success: true, message: 'Treasure Hunt session abandoned' };
  }
};

