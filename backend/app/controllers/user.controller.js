// user.controller.js
const { allAccess } = require('./user/allaccess');
const { adminBoard } = require('./user/adminBoard');
const { userBoard } = require('./user/userBoard');
const { organization } = require('./user/organization');
const { isOnlyUserInOrg } = require('./user/isonlyuserinorg');
const { findAll } = require('./user/findall');
const { findOne } = require('./user/findone');
const { update } = require('./user/update');
const { delete: deleteUser } = require('./user/delete');
const { changePassword } = require('./user/changepassword');
const { changeEmail } = require('./user/changeemail');
const { promoteToModerator } = require('./user/promote');
const { demoteToUser } = require('./user/demote');
const { getUserRoles } = require('./user/roles');
const { getUserProfile } = require('./user/getuserprofile');

module.exports = {
  allAccess,
  adminBoard,
  userBoard,
  organization,
  isOnlyUserInOrg,
  findAll,
  findOne,
  update,
  delete: deleteUser,
  changePassword,
  changeEmail,
  promoteToModerator,
  demoteToUser,
  getUserRoles,
  getUserProfile,
};
