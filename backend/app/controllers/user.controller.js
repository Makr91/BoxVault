// user.controller.js
import { allAccess } from './user/allaccess.js';
import { isOnlyUserInOrg } from './user/isonlyuserinorg.js';
import { findOne } from './user/findone.js';
import { update } from './user/update.js';
import { delete as deleteUser } from './user/delete.js';
import { changePassword } from './user/changepassword.js';
import { changeEmail } from './user/changeemail.js';
import { changeName } from './user/changename.js';
import { getUserProfile } from './user/getuserprofile.js';
import { getUserOrganizations } from './user/organizations.js';
import { leaveOrganization } from './user/leave.js';
import { setPrimaryOrganization } from './user/setprimary.js';
import { updatePreferences } from './user/preferences.js';

export {
  allAccess,
  isOnlyUserInOrg,
  findOne,
  update,
  deleteUser as delete,
  changePassword,
  changeEmail,
  changeName,
  getUserProfile,
  getUserOrganizations,
  leaveOrganization,
  setPrimaryOrganization,
  updatePreferences,
};
