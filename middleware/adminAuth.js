const User = require('../models/User');

function parseAdminIds() {
  return new Set(
    (process.env.ADMIN_TELEGRAM_IDS || '')
      .split(',')
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v))
  );
}

module.exports = async (req, res, next) => {
  try {
    const telegramId = Number(req.user?.telegramId);
    const adminIds = parseAdminIds();

    if (!Number.isFinite(telegramId)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (adminIds.has(telegramId)) {
      return next();
    }

    const user = await User.findOne({ telegramId }).select('isAdmin');
    if (user?.isAdmin) {
      return next();
    }

    return res.status(403).json({ error: 'Admin access required' });
  } catch (err) {
    console.error('adminAuth error:', err);
    return res.status(500).json({ error: 'Admin auth failed' });
  }
};

