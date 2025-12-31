// setup.controller.js
const { verifySetupToken } = require('./setup/verify');
const { uploadSSL } = require('./setup/upload');
const { updateConfigs } = require('./setup/update');
const { getConfigs } = require('./setup/get');
const { isSetupComplete } = require('./setup/check');

module.exports = {
  verifySetupToken,
  uploadSSL,
  updateConfigs,
  getConfigs,
  isSetupComplete,
};
