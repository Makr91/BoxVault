// config.controller.js
import { getConfig } from './config/get.js';
import { getConfigSchema } from './config/schema.js';
import { updateConfig } from './config/update.js';
import { getGravatarProfile } from './config/gravatar.js';
import { getTicketConfig } from './config/ticket.js';
import { getHyperweaverConfig } from './config/hyperweaver.js';
import { restartServer } from './config/restart.js';

export {
  getConfig,
  getConfigSchema,
  updateConfig,
  getGravatarProfile,
  getTicketConfig,
  getHyperweaverConfig,
  restartServer,
};
