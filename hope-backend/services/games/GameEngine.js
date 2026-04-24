class GameEngineError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'GameEngineError';
    this.status = status;
  }
}

class GameEngine {
  constructor(registry) {
    this.registry = registry;
  }

  async invoke(gameId, method, ctx, payload = {}) {
    const plugin = this.registry.get(gameId);
    if (!plugin) {
      throw new GameEngineError(`Unknown game: ${gameId}`, 404);
    }

    if (typeof plugin[method] !== 'function') {
      throw new GameEngineError(`Action not supported for ${gameId}: ${method}`, 400);
    }

    try {
      return await plugin[method](ctx, payload);
    } catch (err) {
      if (err instanceof GameEngineError) throw err;
      const status = Number(err?.status) || 500;
      throw new GameEngineError(err?.message || 'Game action failed', status);
    }
  }

  getCatalog() {
    return this.registry.list().map((plugin) => ({
      id: plugin.id,
      version: plugin.version || '1.0.0',
      ...plugin.meta
    }));
  }
}

module.exports = {
  GameEngine,
  GameEngineError
};

