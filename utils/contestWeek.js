const KeyValue = require('../models/KeyValue');

const KEY = 'current_contest_week';

async function getCurrentContestWeek() {
  const doc = await KeyValue.findOne({ key: KEY }).lean();
  if (doc?.value && typeof doc.value === 'string' && doc.value.trim()) {
    return doc.value.trim();
  }
  return process.env.CURRENT_CONTEST_WEEK || 'Week 1';
}

function getNextWeekLabel(currentLabel) {
  const match = String(currentLabel).match(/^Week\s+(\d+)$/i);
  if (match) {
    return `Week ${parseInt(match[1], 10) + 1}`;
  }
  return `${currentLabel} (Next)`;
}

async function setCurrentContestWeek(label) {
  const week = String(label).trim();
  await KeyValue.findOneAndUpdate(
    { key: KEY },
    { value: week },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return week;
}

module.exports = {
  CONTEST_WEEK_KEY: KEY,
  getCurrentContestWeek,
  getNextWeekLabel,
  setCurrentContestWeek
};
