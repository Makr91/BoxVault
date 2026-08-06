// config.controller.js
import { getConfig } from './config/get.js';
import { updateConfig } from './config/update.js';
import { getGravatarProfile } from './config/gravatar.js';
import { getTicketConfig } from './config/ticket.js';
import { getHyperweaverConfig } from './config/hyperweaver.js';
import { restartServer } from './config/restart.js';

export {
  getConfig,
  updateConfig,
  getGravatarProfile,
  getTicketConfig,
  getHyperweaverConfig,
  restartServer,
};
