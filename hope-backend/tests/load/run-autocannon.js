/* eslint-disable no-console */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.LOAD_BASE_URL || 'http://127.0.0.1:3000';
const COOKIE = process.env.LOAD_COOKIE || '';

const scenarios = {
  auth: {
    description: 'Public auth page warm-up',
    args: ['-c', '20', '-d', '30', `${BASE_URL}/auth`]
  },
  'user-me': {
    description: 'Authenticated user profile read',
    auth: true,
    args: ['-c', '50', '-d', '60', '-p', '10', `${BASE_URL}/api/user/me`]
  },
  leaderboard: {
    description: 'Leaderboard by level read',
    auth: true,
    args: ['-c', '100', '-d', '60', '-p', '10', `${BASE_URL}/api/leaderboard/by-level/1`]
  },
  'mining-start': {
    description: 'Authenticated mining start write path',
    auth: true,
    args: [
      '-c', '20',
      '-d', '60',
      '-p', '5',
      '-m', 'POST',
      '-H', 'Content-Type: application/json',
      '-b', '{}',
      `${BASE_URL}/api/mining/start`
    ]
  }
};

function resolveAutocannonCommand() {
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const localBin = path.join(process.cwd(), 'node_modules', '.bin', `autocannon${ext}`);
  if (fs.existsSync(localBin)) {
    return { command: localBin, preArgs: [] };
  }
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    preArgs: ['autocannon']
  };
}

function printUsage() {
  console.log('Usage: node tests/load/run-autocannon.js <scenario>');
  console.log('');
  console.log('Scenarios:');
  for (const [name, config] of Object.entries(scenarios)) {
    console.log(`  ${name.padEnd(12)} ${config.description}`);
  }
  console.log('');
  console.log('Environment variables:');
  console.log(`  LOAD_BASE_URL   default: ${BASE_URL}`);
  console.log('  LOAD_COOKIE     required for authenticated scenarios');
}

function buildArgs(name, config) {
  const args = [...config.args];
  if (config.auth) {
    if (!COOKIE.trim()) {
      console.error(`Scenario "${name}" requires LOAD_COOKIE.`);
      console.error('Example: set LOAD_COOKIE=token=YOUR_JWT_COOKIE');
      process.exit(1);
    }
    args.unshift(COOKIE);
    args.unshift('Cookie:');
    args.unshift('-H');
  }
  return args;
}

async function main() {
  const scenarioName = process.argv[2];
  if (!scenarioName || scenarioName === '--help' || scenarioName === '-h') {
    printUsage();
    process.exit(scenarioName ? 0 : 1);
  }

  const scenario = scenarios[scenarioName];
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioName}`);
    printUsage();
    process.exit(1);
  }

  const { command, preArgs } = resolveAutocannonCommand();
  const args = [...preArgs, ...buildArgs(scenarioName, scenario)];

  console.log(`Running load scenario: ${scenarioName}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Description: ${scenario.description}`);

  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (err) => {
    console.error('Failed to launch autocannon:', err.message);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Load runner failed:', err);
  process.exit(1);
});
