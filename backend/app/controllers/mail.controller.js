const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const db = require("../models");
const User = db.user;
const Organization = db.organization; 
const crypto = require('crypto');

const smtpConfigPath = path.join(__dirname, '../config/mail.config.yaml');
let smtpConfig;

try {
  const fileContents = fs.readFileSync(smtpConfigPath, 'utf8');
  smtpConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load SMTP configuration: ${e.message}`);
}

const appConfigPath = path.join(__dirname, '../config/app.config.yaml');
let appConfig;

try {
  const fileContents = fs.readFileSync(appConfigPath, 'utf8');
  appConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load app configuration: ${e.message}`);
}

exports.sendVerificationMail = async (user, verificationToken, expirationTime) => {
  console.log('Attempting to send verification email...');
  console.log('SMTP Configuration:', JSON.stringify(smtpConfig, null, 2));

  try {
    console.log('Creating transporter...');
    const transporter = nodemailer.createTransport({
      host: smtpConfig.smtp_connect.host.value,
      port: smtpConfig.smtp_connect.port.value,
      secure: smtpConfig.smtp_connect.secure.value,
      auth: {
        user: smtpConfig.smtp_auth.user.value,
        pass: smtpConfig.smtp_auth.password.value
      },
      debug: true, // Enable debug output
      logger: true // Log to console
    });

    console.log('Transporter created successfully');

    const frontendUrl = appConfig.boxvault.origin.value;
    // Change this line to point to the profile page
    const verificationLink = `${frontendUrl}/profile?token=${verificationToken}`;
    const expirationDate = new Date(expirationTime).toLocaleString();

    console.log('Preparing email...');
    const mailOptions = {
      from: smtpConfig.smtp_settings.from.value,
      to: user.email,
      subject: 'BoxVault Email Verification',
      html: `
        <h1>Welcome to BoxVault</h1>
        <p>Please click the link below to verify your email:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>This verification link will expire on: ${expirationDate}</p>
      `
    };
    console.log('Mail options:', JSON.stringify(mailOptions, null, 2));

    console.log('Sending email...');
    const info = await transporter.sendMail(mailOptions);

    console.log('Verification email sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));

    return info;
  } catch (error) {
    console.error('Error sending verification email:', error);
    console.error('Error stack:', error.stack);
    if (error.response) {
      console.error('SMTP Response:', error.response);
    }
    throw error; // Re-throw the error so it can be handled by the caller
  }
};

exports.resendVerificationMail = async (req, res) => {
  try {
    const user = await User.findByPk(req.userId, {
      include: [{ model: Organization, as: 'organization' }]
    });

    if (!user) {
      return res.status(404).send({ message: "User not found." });
    }

    if (!user.organization) {
      return res.status(404).send({ message: "Organization not found for this user." });
    }

    if (user.verified) {
      return res.status(400).send({ message: "User is already verified." });
    }

    user.verificationToken = crypto.randomBytes(20).toString('hex');
    user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours from now

    await user.save();
    await exports.sendVerificationMail(user, user.verificationToken, user.verificationTokenExpires);
    res.send({ message: "Verification email resent successfully." });
  } catch (err) {
    console.error('Error in resendVerificationMail:', err);
    res.status(500).send({ message: err.message });
  }
};

exports.sendInvitationMail = async (email, token, organizationName, expirationTime) => {
  try {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.smtp_connect.host.value,
      port: smtpConfig.smtp_connect.port.value,
      secure: smtpConfig.smtp_connect.secure.value,
      auth: {
        user: smtpConfig.smtp_auth.user.value,
        pass: smtpConfig.smtp_auth.password.value
      }
    });

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
      `
    };

    await transporter.sendMail(mailOptions);
    return invitationLink;
  } catch (error) {
    console.error('Error sending invitation email:', error);
    throw error;
  }
};

exports.testSmtp = async (req, res) => {
  console.log('Testing SMTP connection...');
  try {
    const transporter = nodemailer.createTransport({
      host: smtpConfig.smtp_connect.host.value,
      port: smtpConfig.smtp_connect.port.value,
      secure: smtpConfig.smtp_connect.secure.value,
      auth: {
        user: smtpConfig.smtp_auth.user.value,
        pass: smtpConfig.smtp_auth.password.value
      },
      debug: true, // Enable debug output
      logger: true // Log to console
    });

    console.log('Transporter created, verifying connection...');
    await transporter.verify();
    console.log('SMTP connection verified successfully');

    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: smtpConfig.smtp_settings.from.value,
      to: req.body.testEmail,
      subject: 'SMTP Test Email',
      text: 'This is a test email to verify SMTP configuration.'
    });

    console.log('Test email sent successfully:', info.messageId);
    res.status(200).send({ message: 'Test email sent successfully', messageId: info.messageId });
  } catch (error) {
    console.error('Error in SMTP test:', error);
    console.error('Error stack:', error.stack);
    if (error.response) {
      console.error('SMTP Response:', error.response);
    }
    res.status(500).send({ message: 'Error sending test email', error: error.message, stack: error.stack });
  }
};