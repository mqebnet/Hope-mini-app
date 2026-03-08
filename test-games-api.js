#!/usr/bin/env node

/**
 * Flip Cards Game - API Test Suite
 * 
 * Usage:
 *   npm install axios dotenv  # if not already installed
 *   node test-games-api.js
 * 
 * Or with JWT token:
 *   node test-games-api.js --jwt <your_jwt_token>
 */

const axios = require('axios');
require('dotenv').config();

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const API = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  validateStatus: () => true // Don't throw on any status
});

let jwtToken = process.argv[3]; // --jwt <token>
let gameSessionId = null;
let currentGameCards = [];

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(color, label, message) {
  console.log(`${color}[${label}] ${message}${colors.reset}`);
}

async function testStartGame() {
  log(colors.cyan, 'TEST 1', 'POST /api/games/flipcards/start');
  
  try {
    const response = await API.post('/api/games/flipcards/start', 
      { difficulty: 'normal' },
      { headers: jwtToken ? { 'Cookie': `token=${jwtToken}` } : {} }
    );
    
    if (response.status === 201 || response.status === 200) {
      gameSessionId = response.data.gameSessionId;
      currentGameCards = response.data.cards || [];
      
      log(colors.green, 'PASS', `Game initialized`);
      log(colors.blue, 'DATA', `  Game ID: ${gameSessionId}`);
      log(colors.blue, 'DATA', `  Cards: ${currentGameCards.length} cards`);
      log(colors.blue, 'DATA', `  Time limit: ${response.data.timeLimit}s`);
      log(colors.blue, 'DATA', `  Difficulty: ${response.data.difficulty}`);
      
      return true;
    } else {
      log(colors.red, 'FAIL', `Status ${response.status}: ${response.data.message}`);
      if (response.status === 401) {
        log(colors.yellow, 'INFO', 'Requires valid JWT token. Use: node test-games-api.js --jwt <token>');
      }
      return false;
    }
  } catch (error) {
    log(colors.red, 'ERROR', error.message);
    return false;
  }
}

async function testGameMove() {
  if (!gameSessionId || currentGameCards.length < 3) {
    log(colors.yellow, 'SKIP', 'Need active game session to test move');
    return false;
  }
  
  log(colors.cyan, 'TEST 2', 'POST /api/games/flipcards/move');
  
  try {
    // Pick first 3 cards for move (may not match, that's OK)
    const cardIds = currentGameCards.slice(0, 3).map(c => c.id);
    
    const response = await API.post('/api/games/flipcards/move',
      { 
        gameSessionId,
        cardIds,
        clientDuration: 2500
      },
      { headers: jwtToken ? { 'Cookie': `token=${jwtToken}` } : {} }
    );
    
    if (response.status === 200) {
      log(colors.green, 'PASS', `Move validated`);
      log(colors.blue, 'DATA', `  Matched: ${response.data.matched}`);
      log(colors.blue, 'DATA', `  Completion: ${response.data.completionPercent}%`);
      log(colors.blue, 'DATA', `  Game complete: ${response.data.gameComplete}`);
      
      if (response.data.matched) {
        log(colors.blue, 'DATA', `  Matched triplet: ${response.data.matchedTripletId}`);
      }
      
      return true;
    } else {
      log(colors.red, 'FAIL', `Status ${response.status}: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    log(colors.red, 'ERROR', error.message);
    return false;
  }
}

async function testGameStatus() {
  if (!gameSessionId) {
    log(colors.yellow, 'SKIP', 'Need active game session to test status');
    return false;
  }
  
  log(colors.cyan, 'TEST 3', 'GET /api/games/flipcards/status/:gameSessionId');
  
  try {
    const response = await API.get(`/api/games/flipcards/status/${gameSessionId}`,
      { headers: jwtToken ? { 'Cookie': `token=${jwtToken}` } : {} }
    );
    
    if (response.status === 200) {
      log(colors.green, 'PASS', `Game status retrieved`);
      log(colors.blue, 'DATA', `  Status: ${response.data.status}`);
      log(colors.blue, 'DATA', `  Progress: ${response.data.completionPercent}%`);
      log(colors.blue, 'DATA', `  Moves: ${response.data.moves}`);
      
      return true;
    } else {
      log(colors.red, 'FAIL', `Status ${response.status}: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    log(colors.red, 'ERROR', error.message);
    return false;
  }
}

async function testGameComplete() {
  if (!gameSessionId) {
    log(colors.yellow, 'SKIP', 'Need active game session to test complete');
    return false;
  }
  
  log(colors.cyan, 'TEST 4', 'POST /api/games/flipcards/complete');
  
  try {
    const response = await API.post('/api/games/flipcards/complete',
      { gameSessionId },
      { headers: jwtToken ? { 'Cookie': `token=${jwtToken}` } : {} }
    );
    
    if (response.status === 200) {
      log(colors.green, 'PASS', `Game completed and reward calculated`);
      
      if (response.data.reward) {
        log(colors.blue, 'DATA', `  Reward points: ${response.data.reward.points}`);
        log(colors.blue, 'DATA', `  Reward XP: ${response.data.reward.xp}`);
        log(colors.blue, 'DATA', `  Reward tickets: ${response.data.reward.bronzeTickets}`);
      }
      
      if (response.data.newStats) {
        log(colors.blue, 'DATA', `  New total points: ${response.data.newStats.points}`);
        log(colors.blue, 'DATA', `  New level: ${response.data.newStats.level}`);
      }
      
      return true;
    } else {
      log(colors.red, 'FAIL', `Status ${response.status}: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    log(colors.red, 'ERROR', error.message);
    return false;
  }
}

async function testGameDelete() {
  if (!gameSessionId) {
    log(colors.yellow, 'SKIP', 'Need active game session to test delete');
    return false;
  }
  
  log(colors.cyan, 'TEST 5', 'DELETE /api/games/flipcards/:gameSessionId');
  
  try {
    const response = await API.delete(`/api/games/flipcards/${gameSessionId}`,
      { headers: jwtToken ? { 'Cookie': `token=${jwtToken}` } : {} }
    );
    
    if (response.status === 200) {
      log(colors.green, 'PASS', `Game session deleted`);
      gameSessionId = null;
      
      return true;
    } else {
      log(colors.red, 'FAIL', `Status ${response.status}: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    log(colors.red, 'ERROR', error.message);
    return false;
  }
}

async function testHealthCheck() {
  log(colors.cyan, 'SETUP', 'Testing API connectivity');
  
  try {
    const response = await API.get('/api/user/me',
      { headers: jwtToken ? { 'Cookie': `token=${jwtToken}` } : {} }
    );
    
    if (response.status === 200 || response.status === 401) {
      // 200 = authenticated, 401 = not authenticated but API is up
      log(colors.green, 'OK', `API responding at ${API_BASE}`);
      
      if (response.status === 401) {
        log(colors.yellow, 'NOTE', 'API is running but not authenticated');
        log(colors.yellow, 'NOTE', 'Some tests may fail. Get JWT token and run: node test-games-api.js --jwt <token>');
      }
      
      return true;
    } else {
      log(colors.red, 'FAIL', `API not responding correctly (${response.status})`);
      return false;
    }
  } catch (error) {
    log(colors.red, 'ERROR', `Cannot reach API at ${API_BASE}`);
    log(colors.yellow, 'NOTE', 'Make sure backend is running: cd hope-backend && npm start');
    return false;
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('  FLIP CARDS GAME - API TEST SUITE');
  console.log('='.repeat(60) + '\n');
  
  const results = {};
  
  // Health check first
  if (!(await testHealthCheck())) {
    log(colors.red, 'ABORT', 'API is not responding. Cannot continue.');
    console.log('\n' + '='.repeat(60) + '\n');
    return;
  }
  
  console.log('');
  
  // Run tests
  results['Start Game'] = await testStartGame();
  console.log('');
  
  results['Game Move'] = await testGameMove();
  console.log('');
  
  results['Game Status'] = await testGameStatus();
  console.log('');
  
  results['Game Complete'] = await testGameComplete();
  console.log('');
  
  results['Game Delete'] = await testGameDelete();
  console.log('');
  
  // Summary
  console.log('='.repeat(60));
  console.log('  TEST SUMMARY');
  console.log('='.repeat(60));
  
  const passed = Object.values(results).filter(v => v === true).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, passed]) => {
    const status = passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`${status} ${test}`);
  });
  
  console.log('\n' + colors.green + `Passed: ${passed}/${total}` + colors.reset);
  
  if (passed === total) {
    console.log(colors.green + '✓ All tests passed! Game API is working correctly.' + colors.reset);
  } else {
    console.log(colors.yellow + '⚠ Some tests failed. Review output above for details.' + colors.reset);
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

// Run tests
runAllTests().catch(error => {
  log(colors.red, 'FATAL', error.message);
  process.exit(1);
});
