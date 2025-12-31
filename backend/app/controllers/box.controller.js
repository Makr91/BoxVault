// box.controller.js
const { create } = require('./box/create');
const { getOrganizationBoxDetails } = require('./box/organization/details');
const { discoverAll } = require('./box/discover');
const { findOne } = require('./box/findone');
const { update } = require('./box/update');
const { delete: deleteBox } = require('./box/delete');
const { deleteAll } = require('./box/deleteall');
const { downloadBox } = require('./box/download');

module.exports = {
  create,
  getOrganizationBoxDetails,
  discoverAll,
  findOne,
  update,
  delete: deleteBox,
  deleteAll,
  downloadBox,
};
