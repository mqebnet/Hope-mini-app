const { GameEngineError } = require('./GameEngine');

class GameRegistry {
  constructor() {
    this.plugins = new Map();
  }

  register(plugin) {
    if (!plugin || typeof plugin !== 'object') {
      throw new GameEngineError('Invalid game plugin', 500);
    }
    if (!plugin.id || typeof plugin.id !== 'string') {
      throw new GameEngineError('Game plugin must define a string id', 500);
    }
    if (!plugin.meta || typeof plugin.meta !== 'object') {
      throw new GameEngineError(`Game plugin ${plugin.id} missing meta`, 500);
    }

    this.plugins.set(plugin.id, plugin);
    return plugin;
  }

  get(gameId) {
    return this.plugins.get(gameId) || null;
  }

  list() {
    return Array.from(this.plugins.values());
  }
}

module.exports = {
  GameRegistry
};

