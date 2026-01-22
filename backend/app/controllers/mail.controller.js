// mail.controller.js
import { sendVerificationMail } from './mail/verification.js';
import { resendVerificationMail } from './mail/resend.js';
import { sendInvitationMail } from './mail/invitation.js';
import { testSmtp } from './mail/test.js';

export { sendVerificationMail, resendVerificationMail, sendInvitationMail, testSmtp };
