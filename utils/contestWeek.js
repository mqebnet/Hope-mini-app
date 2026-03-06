const KeyValue = require('../models/KeyValue');

/**
 * Database key for storing the current active contest week
 * @type {string}
 */
const KEY = 'current_contest_week';

/**
 * Get the current active contest week identifier
 * Fetches from database (KeyValue store) or falls back to env var
 * @async
 * @returns {Promise<string>} Week identifier (e.g., 'Week 1', 'W09 2026')
 * @example
 * const week = await getCurrentContestWeek(); // 'Week 1'
 */
async function getCurrentContestWeek() {
  const doc = await KeyValue.findOne({ key: KEY }).lean();
  if (doc?.value && typeof doc.value === 'string' && doc.value.trim()) {
    return doc.value.trim();
  }
  return process.env.CURRENT_CONTEST_WEEK || 'Week 1';
}

module.exports = {
  CONTEST_WEEK_KEY: KEY,
  getCurrentContestWeek
};

