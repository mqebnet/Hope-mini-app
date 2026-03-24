const KeyValue = require('../models/KeyValue');
const { DAILY_CHECKIN_REWARD } = require('./dailyCheckIn');

/**
 * Database key for storing the task catalog
 * @type {string}
 */
const TASK_CATALOG_KEY = 'task_catalog_v1';

function buildDailyCheckInDescription() {
  return `Start your day with a check-in (+${DAILY_CHECKIN_REWARD.points} points, +${DAILY_CHECKIN_REWARD.bronzeTickets} bronze, +${DAILY_CHECKIN_REWARD.xp} XP)`;
}

function normalizeDailyCheckInTask(task) {
  return {
    ...task,
    id: 'daily-checkin',
    action: 'check-in',
    reward: DAILY_CHECKIN_REWARD.points,
    description: buildDailyCheckInDescription(),
    transactionRequired: true,
    feeUSD: 0.3
  };
}

const DEFAULT_TASK_CATALOG = {
  daily: [
    {
      id: 'daily-checkin',
      title: 'Daily Check-in',
      action: 'check-in',
      reward: DAILY_CHECKIN_REWARD.points,
      description: buildDailyCheckInDescription(),
      transactionRequired: true,
      feeUSD: 0.3
    },
    {
      id: 'visit-telegram',
      title: 'Visit Telegram Channel',
      action: 'visit',
      reward: 100,
      description: 'Check our Telegram updates (+100 points)',
      url: 'https://t.me/+uu0M2YGzaaowOTBk'
    },
    {
      id: 'twitter-engage',
      title: 'Like & Retweet Post',
      action: 'visit',
      reward: 100,
      description: 'Engage with our latest Tweet (+100 points)',
      url: 'https://twitter.com/yourpost'
    },
    {
      id: 'watch-youtube',
      title: 'Watch YouTube Video',
      action: 'visit',
      reward: 100,
      description: 'Watch our latest video (+100 points)',
      url: 'https://youtube.com/yourvideo'
    }
  ],
  oneTime: [
    {
      id: 'join-telegram',
      title: 'Subscribe to Telegram Channel',
      action: 'verify',
      reward: 1000,
      description: 'Become a member (+1000 points)',
      url: 'https://t.me/+uu0M2YGzaaowOTBk'
    },
    {
      id: 'subscribe-youtube',
      title: 'Subscribe to YouTube',
      action: 'verify',
      reward: 1000,
      description: 'Join our video hub (+1000 points)',
      url: 'https://youtube.com/yourchannel'
    },
    {
      id: 'follow-twitter',
      title: 'Follow Twitter Handle',
      action: 'verify',
      reward: 1000,
      description: 'Stay updated (+1000 points)',
      url: 'https://twitter.com/yourhandle'
    },
    {
      id: 'join-group',
      title: 'Join Chat Group (1000 points)',
      action: 'verify',
      reward: 1000,
      description: 'Meet the community (+1000 points)',
      url: 'https://t.me/+xV2HZt47EEMyYmE0'
    },
    {
      id: 'future-task',
      title: 'Special Mission',
      action: 'verify',
      reward: 1000,
      description: 'Coming soon',
      comingSoon: true
    }
  ]
};

/**
 * Create a deep clone of the default task catalog
 * @returns {Object} Cloned catalog with daily and oneTime tasks
 */
function cloneDefaultCatalog() {
  return JSON.parse(JSON.stringify(DEFAULT_TASK_CATALOG));
}

/**
 * Normalize/validate a task catalog object, ensuring it has required structure
 * @param {*} raw - Raw catalog object to normalize
 * @returns {Object} Valid catalog object with {daily: [], oneTime: []}
 */
function normalizeCatalog(raw) {
  if (!raw || typeof raw !== 'object') {
    return cloneDefaultCatalog();
  }
  const safeDaily = Array.isArray(raw.daily)
    ? raw.daily
      .filter((task) => task?.action !== 'play' && task?.id !== 'play-puzzle')
      .map((task) => (task?.id === 'daily-checkin' ? normalizeDailyCheckInTask(task) : task))
    : [];
  const safeOneTime = Array.isArray(raw.oneTime) ? raw.oneTime : [];
  return { daily: safeDaily, oneTime: safeOneTime };
}

/**
 * Fetch the current task catalog from database
 * @async
 * @returns {Promise<Object>} Task catalog with {daily[], oneTime[]}
 * @throws {Error} If database query fails
 */
async function getTaskCatalog() {
  const doc = await KeyValue.findOne({ key: TASK_CATALOG_KEY }).lean();
  if (!doc) {
    return cloneDefaultCatalog();
  }
  return normalizeCatalog(doc.value);
}

/**
 * Update the task catalog in database
 * @async
 * @param {Object} value - New catalog object {daily: [], oneTime: []}
 * @returns {Promise<Object>} Updated and normalized catalog
 * @throws {Error} If database update fails
 */
async function setTaskCatalog(value) {
  const normalized = normalizeCatalog(value);
  await KeyValue.findOneAndUpdate(
    { key: TASK_CATALOG_KEY },
    { value: normalized },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return normalized;
}

module.exports = {
  TASK_CATALOG_KEY,
  getTaskCatalog,
  setTaskCatalog,
  DEFAULT_TASK_CATALOG
};
