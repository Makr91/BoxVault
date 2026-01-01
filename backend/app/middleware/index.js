const authJwt = require('./authJwt');
const verifySignUp = require('./verifySignUp');
const verifyBoxName = require('./verifyBoxName');
const verifyProvider = require('./verifyProvider');
const verifyVersion = require('./verifyVersion');
const verifyArchitecture = require('./verifyArchitecture');
const verifyOrganization = require('./verifyOrganization');
const vagrantHandler = require('./vagrantHandler');
const { rateLimiter } = require('./rateLimiter');
const { downloadAuth } = require('./downloadAuth');
const { sessionAuth } = require('./sessionAuth');
const { errorHandler } = require('./errorHandler');
const { configAwareI18nMiddleware } = require('../config/i18n');

module.exports = {
  authJwt,
  verifySignUp,
  verifyBoxName,
  verifyProvider,
  verifyVersion,
  verifyArchitecture,
  verifyOrganization,
  vagrantHandler,
  rateLimiter,
  downloadAuth,
  sessionAuth,
  errorHandler,
  i18nMiddleware: configAwareI18nMiddleware,
};
