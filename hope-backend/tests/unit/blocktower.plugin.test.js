const test = require('node:test');
const assert = require('node:assert/strict');

const blockTowerPlugin = require('../../services/games/plugins/blockTower');

test('block tower hint rules only enable hints for normal and hard', () => {
  assert.equal(blockTowerPlugin.__test__.hintEnabledForDifficulty('easy'), false);
  assert.equal(blockTowerPlugin.__test__.hintEnabledForDifficulty('normal'), true);
  assert.equal(blockTowerPlugin.__test__.hintEnabledForDifficulty('hard'), true);
});

test('block tower hint pricing escalates from 10 bronze to 20 bronze plus 100 points', () => {
  assert.deepEqual(blockTowerPlugin.__test__.getHintNextCost(0), {
    bronzeTickets: 10,
    points: 0
  });
  assert.deepEqual(blockTowerPlugin.__test__.getHintNextCost(1), {
    bronzeTickets: 20,
    points: 100
  });
  assert.deepEqual(blockTowerPlugin.__test__.getHintNextCost(2), {
    bronzeTickets: 0,
    points: 0
  });
});

test('block tower hint state reports remaining uses correctly', () => {
  const activeState = blockTowerPlugin.__test__.buildHintState({
    difficulty: 'hard',
    state: { hintUses: 1 }
  });
  const easyState = blockTowerPlugin.__test__.buildHintState({
    difficulty: 'easy',
    state: { hintUses: 0 }
  });

  assert.deepEqual(activeState, {
    enabled: true,
    used: 1,
    maxUses: 2,
    remainingUses: 1,
    nextCostBronze: 20,
    nextCostPoints: 100,
    revealSeconds: 10
  });

  assert.deepEqual(easyState, {
    enabled: false,
    used: 0,
    maxUses: 0,
    remainingUses: 0,
    nextCostBronze: 0,
    nextCostPoints: 0,
    revealSeconds: 0
  });
});
