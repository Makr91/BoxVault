// config.controller.js
const { getConfig } = require('./config/get');
const { updateConfig } = require('./config/update');
const { getGravatarConfig } = require('./config/gravatar');
const { getTicketConfig } = require('./config/ticket');
const { restartServer } = require('./config/restart');

module.exports = {
  getConfig,
  updateConfig,
  getGravatarConfig,
  getTicketConfig,
  restartServer,
};
