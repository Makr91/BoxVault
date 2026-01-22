// provider.controller.js
import { create } from './provider/create.js';
import { findAllByVersion } from './provider/findallbyversion.js';
import { findOne } from './provider/findone.js';
import { update } from './provider/update.js';
import { delete as deleteProvider } from './provider/delete.js';
import { deleteAllByVersion } from './provider/deleteallbyversion.js';

export { create, findAllByVersion, findOne, update, deleteProvider as delete, deleteAllByVersion };
