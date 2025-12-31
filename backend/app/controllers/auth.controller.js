// auth.controller.js
const { signup } = require('./auth/signup');
const { signin } = require('./auth/signin');
const { refreshToken } = require('./auth/token');
const { verifyMail } = require('./auth/verification');
const { sendInvitation } = require('./auth/invitation/send');
const { getActiveInvitations } = require('./auth/invitation/get');
const { deleteInvitation } = require('./auth/invitation/delete');
const { validateInvitationToken } = require('./auth/invitation/validate');
const { deleteUser } = require('./auth/user/delete');
const { suspendUser } = require('./auth/user/suspend');
const { resumeUser } = require('./auth/user/resume');
const { updateUser } = require('./auth/user/update');

module.exports = {
  signup,
  signin,
  refreshToken,
  verifyMail,
  sendInvitation,
  getActiveInvitations,
  deleteInvitation,
  validateInvitationToken,
  deleteUser,
  suspendUser,
  resumeUser,
  updateUser,
};
