const cron = require('node-cron');
const User = require('../models/User');
const { sendTelegramMessage, isEnabled } = require('./telegramNotifier');

const MINING_DURATION_MS = 6 * 60 * 60 * 1000;
const REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000;

async function processMiningReminders() {
  const now = Date.now();
  const summary = {
    scanned: 0,
    due: 0,
    sent: 0,
    failed: 0
  };

  const dueUsers = await User.find({
    miningStartedAt: { $ne: null }
  }).select('telegramId username miningStartedAt miningReminderSentAt');
  summary.scanned = dueUsers.length;

  for (const user of dueUsers) {
    const startedAt = user.miningStartedAt ? new Date(user.miningStartedAt).getTime() : 0;
    if (!startedAt || (now - startedAt) < MINING_DURATION_MS) {
      continue;
    }

    const lastReminderAt = user.miningReminderSentAt ? new Date(user.miningReminderSentAt).getTime() : 0;
    if (lastReminderAt && (now - lastReminderAt) < REMINDER_COOLDOWN_MS) {
      continue;
    }
    summary.due += 1;

    const msg = [
      'Your mining cycle is complete.',
      'Open HOPE and tap <b>Claim</b> to collect your points.'
    ].join('\n');

    const result = await sendTelegramMessage(user.telegramId, msg);
    if (!result.ok) {
      summary.failed += 1;
      continue;
    }

    user.miningReminderSentAt = new Date(now);
    await user.save();
    summary.sent += 1;
  }

  return summary;
}

function startNotificationScheduler() {
  if (!isEnabled()) {
    console.log('Telegram notifications disabled (ENABLE_TELEGRAM_NOTIFICATIONS!=true)');
    return;
  }

  cron.schedule('*/15 * * * *', async () => {
    try {
      await processMiningReminders();
    } catch (err) {
      console.error('Mining reminder scheduler error:', err);
    }
  });

  console.log('Notification scheduler started (every 15 minutes).');
}

module.exports = {
  startNotificationScheduler,
  processMiningReminders
};
