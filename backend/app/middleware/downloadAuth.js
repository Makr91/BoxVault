const { verifyDownloadToken } = require('../utils/auth');
const { log } = require('../utils/Logger');

const downloadAuth = async (req, res, next) => {
  const downloadToken = req.query.token;
  if (downloadToken) {
    try {
      const decoded = await verifyDownloadToken(downloadToken);
      req.downloadTokenDecoded = decoded;
      req.userId = decoded.userId;
      req.isServiceAccount = decoded.isServiceAccount;
      return next();
    } catch (err) {
      log.app.warn('Invalid download token:', err.message);
      return res.status(403).send({ message: 'Invalid or expired download token.' });
    }
  }
  // If no token, continue to controller which handles other auth methods
  return next();
};

module.exports = { downloadAuth };
