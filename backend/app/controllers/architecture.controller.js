// architecture.controller.js
const { create } = require('./architecture/create');
const { findAllByProvider } = require('./architecture/provider/findall');
const { findOne } = require('./architecture/findone');
const { update } = require('./architecture/update');
const { delete: deleteArchitecture } = require('./architecture/delete');
const { deleteAllByProvider } = require('./architecture/provider/deleteall');

module.exports = {
  create,
  findAllByProvider,
  findOne,
  update,
  delete: deleteArchitecture,
  deleteAllByProvider,
};
