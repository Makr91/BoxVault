// organization.controller.js
const { create } = require('./organization/create');
const { findAllWithUsers } = require('./organization/findallwithusers');
const { findOneWithUsers } = require('./organization/findonewithusers');
const { findAll } = require('./organization/findall');
const { findOne } = require('./organization/findone');
const { update } = require('./organization/update');
const { delete: deleteOrganization } = require('./organization/delete');
const { suspendOrganization } = require('./organization/suspend');
const { resumeOrganization } = require('./organization/resume');
const { discoverOrganizations } = require('./organization/discover');
const { updateAccessMode } = require('./organization/accessmode');
const { getUserOrgRole } = require('./organization/userrole');
const { updateUserOrgRole } = require('./organization/updateuserrole');
const { removeUserFromOrg } = require('./organization/removeuser');

module.exports = {
  create,
  findAllWithUsers,
  findOneWithUsers,
  findAll,
  findOne,
  update,
  delete: deleteOrganization,
  suspendOrganization,
  resumeOrganization,
  discoverOrganizations,
  updateAccessMode,
  getUserOrgRole,
  updateUserOrgRole,
  removeUserFromOrg,
};
