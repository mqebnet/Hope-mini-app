const { GameRegistry } = require('./GameRegistry');
const { GameEngine, GameEngineError } = require('./GameEngine');
const flipcardsPlugin = require('./plugins/flipcards');
const mysteryBoxPlugin = require('./plugins/mysteryBox');
const slidingTilesPlugin = require('./plugins/slidingTiles');
const blockTowerPlugin = require('./plugins/blockTower');
const shellGamePlugin = require('./plugins/shellgame');
const quizPlugin = require('./plugins/quiz');
const treasureHuntPlugin = require('./plugins/treasureHunt');

const registry = new GameRegistry();
registry.register(mysteryBoxPlugin);
registry.register(flipcardsPlugin);
registry.register(slidingTilesPlugin);
registry.register(blockTowerPlugin);
registry.register(shellGamePlugin);
registry.register(quizPlugin);
registry.register(treasureHuntPlugin);

const gameEngine = new GameEngine(registry);

module.exports = {
  gameEngine,
  GameEngineError
};
