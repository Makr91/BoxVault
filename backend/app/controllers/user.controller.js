// user.controller.js
import { allAccess } from './user/allaccess.js';
import { adminBoard } from './user/adminBoard.js';
import { userBoard } from './user/userBoard.js';
import { isOnlyUserInOrg } from './user/isonlyuserinorg.js';
import { findOne } from './user/findone.js';
import { update } from './user/update.js';
import { delete as deleteUser } from './user/delete.js';
import { changePassword } from './user/changepassword.js';
import { changeEmail } from './user/changeemail.js';
import { promoteToModerator } from './user/promote.js';
import { demoteToUser } from './user/demote.js';
import { getUserRoles } from './user/roles.js';
import { getUserProfile } from './user/getuserprofile.js';
import { getUserOrganizations } from './user/organizations.js';
import { leaveOrganization } from './user/leave.js';
import { getPrimaryOrganization } from './user/primary.js';
import { setPrimaryOrganization } from './user/setprimary.js';

export {
  allAccess,
  adminBoard,
  userBoard,
  isOnlyUserInOrg,
  findOne,
  update,
  deleteUser as delete,
  changePassword,
  changeEmail,
  promoteToModerator,
  demoteToUser,
  getUserRoles,
  getUserProfile,
  getUserOrganizations,
  leaveOrganization,
  getPrimaryOrganization,
  setPrimaryOrganization,
};
