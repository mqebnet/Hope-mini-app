const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  if (!req.cookies?.jwt) {
    return res.sendFile(
      require('path').join(__dirname, '../public/auth.html')
    );
  }

  try {
    const decoded = jwt.verify(req.cookies.jwt, process.env.JWT_SECRET);
    const telegramId = Number(decoded?.telegramId);
    if (!Number.isFinite(telegramId)) {
      res.clearCookie('jwt');
      return res.redirect('/auth');
    }

    const exists = await User.exists({ telegramId });
    if (!exists) {
      res.clearCookie('jwt');
      return res.redirect('/auth');
    }

    req.user = decoded;
    next();
  } catch {
    res.clearCookie('jwt');
    return res.redirect('/auth');
  }
};
