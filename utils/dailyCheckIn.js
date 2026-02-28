const { getUserLevel } = require('./levelUtil');

const DAILY_CHECKIN_REWARD = {
  points: 1000,
  bronzeTickets: 100,
  xp: 5
};

const PERFECT_STREAK_DAYS = 10;
const PERFECT_STREAK_BADGE = 'perfect-streak-10';
const RESET_OFFSET_MINUTES_UTC = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function getCheckInDayKey(date = new Date()) {
  const shifted = new Date(date.getTime() - RESET_OFFSET_MINUTES_UTC * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function dayKeyDiff(fromDayKey, toDayKey) {
  if (!fromDayKey || !toDayKey) return 0;
  const from = new Date(`${fromDayKey}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDayKey}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / DAY_MS);
}

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
