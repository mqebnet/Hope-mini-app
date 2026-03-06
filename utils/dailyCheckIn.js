const { getUserLevel } = require('./levelUtil');

/**
 * Daily check-in reward values
 * @type {Object}
 * @property {number} points - Points awarded (1000)
 * @property {number} bronzeTickets - Bronze tickets awarded (100)
 * @property {number} xp - XP awarded (5)
 */
const DAILY_CHECKIN_REWARD = {
  points: 1000,
  bronzeTickets: 100,
  xp: 5
};

/** @type {number} Days required for perfect streak badge */
const PERFECT_STREAK_DAYS = 10;

/** @type {string} Badge identifier for perfect streak achievement */
const PERFECT_STREAK_BADGE = 'perfect-streak-10';

/** @type {number} UTC reset happens at XX:02 UTC */
const RESET_OFFSET_MINUTES_UTC = 2;

/** @type {number} Milliseconds in one day */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Get the day key for a given date, normalized to reset time (00:02 UTC)
 * Used to distinguish days even when reset happens at 00:02, not 00:00
 * @param {Date} [date=new Date()] - Date to get key for
 * @returns {string} Day key in format YYYY-MM-DD
 * @example
 * getCheckInDayKey(new Date('2026-03-04T01:00:00Z')) // '2026-03-03'
 * getCheckInDayKey(new Date('2026-03-04T03:00:00Z')) // '2026-03-04'
 */
function getCheckInDayKey(date = new Date()) {
  const shifted = new Date(date.getTime() - RESET_OFFSET_MINUTES_UTC * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Calculate the number of days between two day keys
 * @param {string} fromDayKey - Earlier day (YYYY-MM-DD)
 * @param {string} toDayKey - Later day (YYYY-MM-DD)
 * @returns {number} Difference in days (can be 0 or negative)
 */
function dayKeyDiff(fromDayKey, toDayKey) {
  if (!fromDayKey || !toDayKey) return 0;
  const from = new Date(`${fromDayKey}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDayKey}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / DAY_MS);
}

/**
 * Get the next UTC reset time (00:02 UTC)
 * @param {Date} [now=new Date()] - Reference time
 * @returns {Date} Next reset time in UTC
 * @example
 * // If now is 2026-03-04T00:01:00Z, returns 2026-03-04T00:02:00Z
 * // If now is 2026-03-04T00:03:00Z, returns 2026-03-05T00:02:00Z
 */
function getNextResetAtUtc(now = new Date()) {
  const resetToday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    RESET_OFFSET_MINUTES_UTC,
    0,
    0
  ));
  if (now.getTime() < resetToday.getTime()) return resetToday;
  return new Date(resetToday.getTime() + DAY_MS);
}

/**
 * Check if user missed a day and reset streak accordingly
 * User's streak resets to 0 if more than 1 day has passed since last check-in
 * @param {Object} user - User document
 * @param {Date} [now=new Date()] - Current time
 * @returns {boolean} True if streak was modified, false otherwise
 */
function normalizeStreakIfMissed(user, now = new Date()) {
  if (!user?.lastCheckInDate) return false;
  const lastDayKey = getCheckInDayKey(new Date(user.lastCheckInDate));
  const currentDayKey = getCheckInDayKey(now);
  const diff = dayKeyDiff(lastDayKey, currentDayKey);
  if (diff > 1 && user.streak !== 0) {
    user.streak = 0;
    return true;
  }
  return false;
}

/**
 * Build a calendar of check-in history for display to user
 * @param {Object} user - User document
 * @param {Date} [now=new Date()] - Current time
 * @param {number} [days=14] - Number of days to include
 * @returns {Array<Object>} Calendar entries: {dayKey, status, checked}
 *   where status is: 'upcoming' | 'checked' | 'available' | 'missed'
 */
function buildCheckInCalendar(user, now = new Date(), days = 14) {
  const checkedKeys = new Set((user.checkIns || []).map((c) => c.dayKey));
  const currentDayKey = getCheckInDayKey(now);
  const currentTime = new Date(`${currentDayKey}T00:00:00.000Z`).getTime();

  const calendar = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayTime = currentTime - i * DAY_MS;
    const dayKey = new Date(dayTime).toISOString().slice(0, 10);
    const checked = checkedKeys.has(dayKey);
    let status = 'upcoming';

    if (checked) status = 'checked';
    else if (dayKey === currentDayKey) status = 'available';
    else if (dayTime < currentTime) status = 'missed';

    calendar.push({ dayKey, status, checked });
  }

  return calendar;
}

/**
 * Apply rewards for a verified daily check-in transaction
 * Updates user: points, tickets, XP, streak, level, and may award perfect-streak badge
 * Does NOT save to database; caller must do that
 * @param {Object} user - User document (will be modified)
 * @param {string} txHash - Transaction hash/reference for verification
 * @param {Date} [now=new Date()] - Current time
 * @returns {Object} Result object:
 *   {ok: true, dayKey, streak, perfectStreakBadgeAwarded} on success
 *   {ok: false, status, error} on failure
 */
function applyVerifiedDailyCheckIn(user, txHash, now = new Date()) {
  user.checkIns = user.checkIns || [];

  if (user.checkIns.some((c) => c.dayKey === getCheckInDayKey(now))) {
    return { ok: false, status: 400, error: 'Already checked in today' };
  }

  if (user.checkIns.some((c) => c.txHash === txHash)) {
    return { ok: false, status: 400, error: 'Transaction already used for check-in' };
  }

  const todayKey = getCheckInDayKey(now);
  const lastDayKey = user.lastCheckInDate ? getCheckInDayKey(new Date(user.lastCheckInDate)) : null;
  const dayGap = lastDayKey ? dayKeyDiff(lastDayKey, todayKey) : null;

  if (dayGap === 1) {
    user.streak = (user.streak || 0) + 1;
  } else {
    user.streak = 1;
  }

  user.points = (user.points || 0) + DAILY_CHECKIN_REWARD.points;
  user.bronzeTickets = (user.bronzeTickets || 0) + DAILY_CHECKIN_REWARD.bronzeTickets;
  user.xp = (user.xp || 0) + DAILY_CHECKIN_REWARD.xp;
  user.level = getUserLevel(user.points || 0);
  user.lastCheckInDate = now;

  user.checkIns.push({
    txHash,
    verified: true,
    dayKey: todayKey,
    createdAt: now
  });

  user.badges = user.badges || [];
  let perfectStreakBadgeAwarded = false;
  if (user.streak >= PERFECT_STREAK_DAYS && !user.badges.includes(PERFECT_STREAK_BADGE)) {
    user.badges.push(PERFECT_STREAK_BADGE);
    perfectStreakBadgeAwarded = true;
  }

  return {
    ok: true,
    dayKey: todayKey,
    streak: user.streak,
    perfectStreakBadgeAwarded
  };
}

module.exports = {
  DAILY_CHECKIN_REWARD,
  PERFECT_STREAK_BADGE,
  PERFECT_STREAK_DAYS,
  getCheckInDayKey,
  getNextResetAtUtc,
  normalizeStreakIfMissed,
  buildCheckInCalendar,
  applyVerifiedDailyCheckIn
};
