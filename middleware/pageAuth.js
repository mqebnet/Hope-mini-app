const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  if (!req.cookies?.jwt) {
    return res.sendFile(
      require('path').join(__dirname, '../public/auth.html')
    );
  }

  try {
    req.user = jwt.verify(req.cookies.jwt, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie('jwt');
    return res.redirect('/auth');
  }
};
