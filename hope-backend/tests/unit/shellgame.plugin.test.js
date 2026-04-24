const test = require('node:test');
const assert = require('node:assert/strict');

const shellGamePlugin = require('../../services/games/plugins/shellgame');

test('buildRoundState keeps the hidden ball on the revealed cup identity', () => {
  const sequence = [['A', 'B'], ['B', 'C'], ['A', 'C']];
  const state = shellGamePlugin.__test__.buildRoundState('normal', {
    startingBallCupId: 'A',
    shuffleSequence: sequence
  });

  assert.equal(state.startingBallCupId, 'A');
  assert.equal(state.ballCupId, 'A');
  assert.deepEqual(state.shuffleSequence, sequence);
});

test('buildRoundState honors each difficulty timer and shuffle count', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const config = shellGamePlugin.__test__.getConfig(difficulty);
    const state = shellGamePlugin.__test__.buildRoundState(difficulty);

    assert.equal(state.shuffleCount, config.shuffleCount);
    assert.equal(state.decisionTimerSeconds, config.decisionTimerSeconds);
    assert.equal(state.shuffleSequence.length, config.shuffleCount);
    assert.equal(state.ballCupId, state.startingBallCupId);
  }
});

test('hard mode time limit leaves headroom for a full five-round run', () => {
  const config = shellGamePlugin.__test__.getConfig('hard');
  const leadMs = shellGamePlugin.__test__.getRoundLeadMs('hard');
  const maxRoundMs = leadMs + (config.decisionTimerSeconds * 1000) + 500;
  const fiveRoundFloorSeconds = Math.ceil((maxRoundMs * 5) / 1000);

  assert.ok(
    config.timeLimitSeconds >= fiveRoundFloorSeconds + 10,
    `expected hard mode time limit to exceed ${fiveRoundFloorSeconds + 10}s, got ${config.timeLimitSeconds}s`
  );
});
