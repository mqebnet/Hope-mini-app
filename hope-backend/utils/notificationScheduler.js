const cron = require('node-cron');
const User = require('../models/User');
const { sendTelegramMessage, isEnabled } = require('./telegramNotifier');

const MINING_DURATION_MS = 6 * 60 * 60 * 1000;
const REMINDER_COOLDOWN_MS = 6 * 60 * 60 * 1000;

async function processMiningReminders() {
  const now = Date.now();
  const sixHoursAgo = new Date(now - MINING_DURATION_MS);
  const cooldownAgo = new Date(now - REMINDER_COOLDOWN_MS);
  const summary = {
    scanned: 0,
    due: 0,
    sent: 0,
    failed: 0
  };

  const dueUsers = await User.find({
    telegramId: { $lt: 9_000_000_000 },
    miningStartedAt: { $lte: sixHoursAgo },
    $or: [
      { miningReminderSentAt: null },
      { miningReminderSentAt: { $lte: cooldownAgo } }
    ]
  })
    .select('telegramId username miningStartedAt miningReminderSentAt')
    .limit(500);
  summary.scanned = dueUsers.length;
  summary.due = dueUsers.length;

  for (const user of dueUsers) {
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
