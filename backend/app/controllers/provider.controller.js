// provider.controller.js
const { create } = require('./provider/create');
const { findAllByVersion } = require('./provider/findallbyversion');
const { findOne } = require('./provider/findone');
const { update } = require('./provider/update');
const { delete: deleteProvider } = require('./provider/delete');
const { deleteAllByVersion } = require('./provider/deleteallbyversion');

module.exports = {
  create,
  findAllByVersion,
  findOne,
  update,
  delete: deleteProvider,
  deleteAllByVersion,
};
