// middleware.js
const { getAuthorizedSetupToken } = require('./helpers');

const verifyAuthorizedToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Extract the token from the Bearer header

  if (!token || token !== getAuthorizedSetupToken()) {
    return res.status(403).send(req.__('setup.invalidToken'));
  }
  return next();
};

module.exports = {
  verifyAuthorizedToken,
};
