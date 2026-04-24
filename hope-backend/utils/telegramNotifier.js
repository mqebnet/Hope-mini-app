const axios = require('axios');

function isEnabled() {
  return process.env.ENABLE_TELEGRAM_NOTIFICATIONS === 'true';
}

function getBotToken() {
  return process.env.BOT_TOKEN || '';
}

async function sendTelegramMessage(telegramId, text, extra = {}) {
  const botToken = getBotToken();
  if (!isEnabled() || !botToken || !telegramId || !text) {
    return { ok: false, skipped: true };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const response = await axios.post(url, {
      chat_id: Number(telegramId),
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra
    }, {
      timeout: 12000
    });

    return { ok: Boolean(response?.data?.ok), data: response?.data };
  } catch (err) {
    const details = err?.response?.data || err.message;
    console.error('Telegram sendMessage failed:', details);
    return { ok: false, error: details };
  }
}

async function sendBulkTelegramMessage(telegramIds, text, extra = {}) {
  const ids = [...new Set((telegramIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))];
  const results = [];
  for (const telegramId of ids) {
    // sequential by design to avoid burst throttling
    const result = await sendTelegramMessage(telegramId, text, extra);
    results.push({ telegramId, ...result });
  }
  return results;
}

module.exports = {
  isEnabled,
  sendTelegramMessage,
  sendBulkTelegramMessage
};

