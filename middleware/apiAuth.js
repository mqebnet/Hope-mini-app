const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  const token =
    req.cookies?.jwt ||
    req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const telegramId = Number(decoded?.telegramId);
    if (!Number.isFinite(telegramId)) {
      res.clearCookie('jwt');
      return res.status(401).json({ error: 'Invalid token' });
    }

    const exists = await User.exists({ telegramId });
    if (!exists) {
      res.clearCookie('jwt');
      return res.status(401).json({ error: 'User no longer exists' });
    }

    req.user = decoded;
    next();
  } catch {
    res.clearCookie('jwt');
    return res.status(401).json({ error: 'Invalid token' });
  }
};
