// architecture.controller.js
import { create } from './architecture/create.js';
import { findAllByProvider } from './architecture/provider/findall.js';
import { findOne } from './architecture/findone.js';
import { update } from './architecture/update.js';
import { delete as deleteArchitecture } from './architecture/delete.js';
import { deleteAllByProvider } from './architecture/provider/deleteall.js';

export {
  create,
  findAllByProvider,
  findOne,
  update,
  deleteArchitecture as delete,
  deleteAllByProvider,
};
