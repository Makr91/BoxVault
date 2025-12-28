const crypto = require('crypto');
const { log } = require('../utils/Logger');

/**
 * Handle external user authentication and provisioning
 * @param {string} provider - Authentication provider (ldap, oidc, etc.)
 * @param {Object} profile - User profile from external provider
 * @param {Object} db - Database models
 * @param {Object} authConfig - Authentication configuration
 * @returns {Promise<Object>} User object for authentication
 */
const handleExternalUser = async (provider, profile, db, authConfig) => {
  const {
    user: User,
    credential: Credential,
  } = db;

  try {
    const email = profile.mail || profile.email || profile.emails?.[0]?.value;
    if (!email) {
      throw new Error(`No email found in ${provider} profile`);
    }

    let subject = profile.uid || profile.sub || profile.id || profile.cn;

    if (!subject && profile.dn) {
      const dnMatch = profile.dn.match(/^uid=(?<id>[^,]+)/i) || profile.dn.match(/^cn=(?<id>[^,]+)/i);
      if (dnMatch) {
        const [, extractedSubject] = dnMatch;
        subject = extractedSubject;
      }
    }

    if (!subject) {
      throw new Error(`No user identifier found in ${provider} profile`);
    }

    // Normalize provider name for database storage
    const normalizedProvider = provider.startsWith('oidc-') ? 'oidc' : provider;

    // 1. Check if credential already exists
    const credential = await Credential.findByProviderAndSubject(normalizedProvider, subject);

    if (credential) {
      await credential.updateProfile(profile);
      const user = await User.findByPk(credential.user_id);

      if (!user || user.suspended) {
        throw new Error('User account is inactive');
      }

      if (!user.organizationId) {
        const organizationId = await determineUserOrganization(email, profile, db, authConfig);
        await user.update({
          organizationId,
          linkedAt: new Date(),
        });
      }

      return user;
    }

    // 2. Check if user exists by email
    let user = await User.findOne({ where: { email } });
    if (user) {
      const baseProvider = provider.startsWith('oidc-') ? 'oidc' : provider;

      if (!user.organizationId) {
        const organizationId = await determineUserOrganization(email, profile, db, authConfig);
        await user.update({
          organizationId,
          authProvider: baseProvider,
          externalId: subject,
          linkedAt: new Date(),
        });
      } else {
        await user.update({
          authProvider: baseProvider,
          externalId: subject,
          linkedAt: new Date(),
        });
      }

      try {
        await Credential.linkToUser(user.id, normalizedProvider, { ...profile, subject });
      } catch {
        // Credential might already exist
      }

      // Check if existing user has roles, if not assign default role
      const roles = await user.getRoles();
      if (!roles || roles.length === 0) {
        const { role: Role } = db;
        const defaultRoleName =
          authConfig.auth?.external?.provisioning_default_role?.value || 'user';
        const defaultRole = await Role.findOne({ where: { name: defaultRoleName } });

        if (defaultRole) {
          await user.setRoles([defaultRole]);
          log.app.info(
            `Assigned role '${defaultRoleName}' to existing external user: ${user.email}`
          );
        }
      }

      return user;
    }

    // 3. New external user - apply provisioning policy
    const organizationId = await determineUserOrganization(email, profile, db, authConfig);
    const baseProvider = provider.startsWith('oidc-') ? 'oidc' : provider;

    user = await User.create({
      username: profile.displayName || profile.cn || email.split('@')[0],
      email,
      password: 'external',
      emailHash: crypto.createHash('sha256').update(email.toLowerCase()).digest('hex'),
      verified: true,
      organizationId,
      authProvider: baseProvider,
      externalId: subject,
      linkedAt: new Date(),
    });

    // Assign default role to new external user
    const { role: Role } = db;
    const defaultRoleName = authConfig.auth?.external?.provisioning_default_role?.value || 'user';
    const defaultRole = await Role.findOne({ where: { name: defaultRoleName } });

    if (defaultRole) {
      await user.setRoles([defaultRole]);
      log.app.info(`Assigned role '${defaultRoleName}' to new external user: ${user.email}`);
    } else {
      log.app.warn(`Default role '${defaultRoleName}' not found, user created without roles`);
    }

    await Credential.linkToUser(user.id, normalizedProvider, { ...profile, subject });

    return user;
  } catch (error) {
    log.error.error('External user handling failed:', error.message);
    throw error;
  }
}

/**
 * Determine organization for external user
 * @param {string} email - User email address
 * @param {Object} _profile - External user profile (reserved for future use)
 * @param {Object} db - Database models
 * @param {Object} authConfig - Authentication configuration
 * @returns {Promise<number>} Organization ID
 */
const determineUserOrganization = async (email, _profile, db, authConfig) => {
  const { organization: Organization, invitation: Invitation } = db;
  const [, domain] = email.split('@');

  // 1. Check pending invitation
  const invitation = await Invitation.findOne({
    where: {
      email,
      accepted: false,
      expired: false,
      expires: {
        [db.Sequelize.Op.gt]: new Date(),
      },
    },
  });

  if (invitation) {
    await invitation.update({ accepted: true });
    return invitation.organizationId;
  }

  // 2. Check domain mapping
  if (authConfig.auth?.external?.domain_mapping_enabled?.value) {
    try {
      const mappingsJson = authConfig.auth.external?.domain_mappings?.value || '{}';
      const mappings = JSON.parse(mappingsJson);

      // eslint-disable-next-line no-await-in-loop -- Sequential search with early exit
      for (const [, domains] of Object.entries(mappings)) {
        if (Array.isArray(domains) && domains.includes(domain)) {
          // Use just the domain name for BoxVault (not ZoneWeaver prefix format)
          const orgName = domain;

          const org = await Organization.findOne({ where: { name: orgName } });
          if (org) {
            return org.id;
          }
          break;
        }
      }
    } catch (error) {
      log.error.error('Failed to parse domain mappings JSON:', error.message);
    }
  }

  // 3. Apply fallback policy
  const fallbackAction =
    authConfig.auth?.external?.provisioning_fallback_action?.value || 'require_invite';

  switch (fallbackAction) {
    case 'require_invite':
      throw new Error(`Access denied: Invitation required for domain ${domain}`);

    case 'create_org': {
      // Use just the domain name for BoxVault (not ZoneWeaver prefix format)
      const orgName = domain;

      const newOrg = await Organization.create({
        name: orgName,
        description: `Auto-created organization for domain ${domain}`,
      });
      return newOrg.id;
    }

    case 'deny_access':
      throw new Error(`Access denied: Domain ${domain} is not allowed`);

    default:
      throw new Error(`Access denied: No provisioning policy match for domain ${domain}`);
  }
}

/**
 * Generate a random organization code
 * @returns {string} Random 6-character hexcode
 */
const generateOrgCode = () => Math.random().toString(16).substr(2, 6).toUpperCase();

module.exports = {
  handleExternalUser,
  determineUserOrganization,
  generateOrgCode,
};
