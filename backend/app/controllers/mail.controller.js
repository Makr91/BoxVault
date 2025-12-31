// mail.controller.js
const { sendVerificationMail } = require('./mail/verification');
const { resendVerificationMail } = require('./mail/resend');
const { sendInvitationMail } = require('./mail/invitation');
const { testSmtp } = require('./mail/test');

module.exports = {
  sendVerificationMail,
  resendVerificationMail,
  sendInvitationMail,
  testSmtp,
};
