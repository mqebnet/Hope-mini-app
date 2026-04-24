const { GameEngineError } = require('../GameEngine');

function getTelegramId(ctx) {
  const value = ctx?.user?.telegramId ?? ctx?.telegramId ?? null;
  const telegramId = Number(value);
  if (!Number.isFinite(telegramId)) throw new GameEngineError('Unauthorized', 401);
  return telegramId;
}

module.exports = {
  id: 'quiz',
  version: '0.1.0',
  meta: {
    name: 'Quiz Arena',
    description: 'Answer timed crypto and ecosystem questions to earn rewards.',
    icon: '❓',
    type: 'knowledge',
    category: 'games',
    entryFeeUsd: 0,
    status: 'coming-soon'
  },

  async start(ctx, payload = {}) {
    getTelegramId(ctx);
    return {
      success: true,
      gameId: 'quiz',
      status: 'coming-soon',
      message: 'Quiz engine scaffold is ready. Add question bank + session model to go live.',
      config: {
        timeLimitSeconds: Number(payload.timeLimitSeconds || 60),
        maxQuestions: Number(payload.maxQuestions || 10)
      }
    };
  },

  async move(ctx) {
    getTelegramId(ctx);
    throw new GameEngineError('Quiz move handler not implemented yet', 501);
  },

  async complete(ctx) {
    getTelegramId(ctx);
    throw new GameEngineError('Quiz complete handler not implemented yet', 501);
  },

  async getSession(ctx) {
    getTelegramId(ctx);
    throw new GameEngineError('Quiz session handler not implemented yet', 501);
  },

  async abandon(ctx) {
    getTelegramId(ctx);
    return { success: true, message: 'Quiz session abandoned' };
  }
};

