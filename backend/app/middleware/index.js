const authJwt = require('./authJwt');
const verifySignUp = require('./verifySignUp');
const verifyBoxName = require('./verifyBoxName');
const verifyProvider = require('./verifyProvider');
const verifyVersion = require('./verifyVersion');
const verifyArchitecture = require('./verifyArchitecture');
const verifyOrganization = require('./verifyOrganization');
const vagrantHandler = require('./vagrantHandler');
const rateLimiter = require('./rateLimiter');
const { optionalAuth } = require('./optionalAuth');

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
  optionalAuth,
};
