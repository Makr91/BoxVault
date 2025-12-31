// invitation.js
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const { createTransporter, smtpConfig } = require('./helpers');

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load app configuration: ${e.message}`);
}

const sendInvitationMail = async (email, token, organizationName, expirationTime) => {
  try {
    const transporter = createTransporter();

    const frontendUrl = appConfig.boxvault.origin.value;
    const invitationLink = `${frontendUrl}/register?token=${token}&organization=${organizationName}`;
    const expirationDate = new Date(expirationTime).toLocaleString();

    const mailOptions = {
      from: smtpConfig.smtp_settings.from.value,
      to: email,
      subject: `BoxVault Organization Invitation for ${organizationName}`,
      html: `
        <h1>Invitation to Join BoxVault Organization: ${organizationName}</h1>
        <p>Please click the link below to join the organization:</p>
        <a href="${invitationLink}">Join Organization</a>
        <p>This invitation link will expire on: ${expirationDate}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    return invitationLink;
  } catch (error) {
    log.error.error('Error sending invitation email:', error);
    throw error;
  }
};

module.exports = {
  sendInvitationMail,
};
