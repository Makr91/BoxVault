import { createHash } from 'crypto';
import { log } from '../utils/Logger.js';

/**
 * Generate a random organization code
 * @returns {string} Random 6-character hexcode
 */
const generateOrgCode = () => Math.random().toString(16).substr(2, 6).toUpperCase();

/**
 * Assign default role to user if they don't have any roles
 * @param {Object} user - User object
 * @param {Object} db - Database models
 * @param {Object} authConfig - Authentication configuration
 * @returns {Promise<void>}
 */
const assignDefaultRoleIfNeeded = async (user, db, authConfig) => {
  const roles = await user.getRoles();
  if (!roles || roles.length === 0) {
    const { role: Role } = db;
    const defaultRoleName = authConfig.auth?.external?.provisioning_default_role?.value || 'user';
    const defaultRole = await Role.findOne({ where: { name: defaultRoleName } });

    if (defaultRole) {
      await user.setRoles([defaultRole]);
      log.app.info(`Assigned role '${defaultRoleName}' to external user: ${user.email}`);
    } else {
      log.app.warn(`Default role '${defaultRoleName}' not found, user created without roles`);
    }
  }
};

/**
 * Determine organization for external user
 * @param {string} email - User email address
 * @param {Object} db - Database models
 * @param {Object} authConfig - Authentication configuration
 * @returns {Promise<number>} Organization ID
 */
const determineUserOrganization = async (email, db, authConfig) => {
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

      // Find matching domain first, then do single await lookup
      let matchedOrgName = null;
      for (const [orgName, domains] of Object.entries(mappings)) {
        if (Array.isArray(domains) && domains.includes(domain)) {
          matchedOrgName = orgName;
          break;
        }
      }

      if (matchedOrgName) {
        const org = await Organization.findOne({ where: { name: matchedOrgName } });
        if (org) {
          return org.id;
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
      const orgName = domain;
      const newOrg = await Organization.create({
        name: orgName,
        org_code: generateOrgCode(),
        description: `Auto-created organization for domain ${domain}`,
      });
      return newOrg.id;
    }

    case 'deny_access':
      throw new Error(`Access denied: Domain ${domain} is not allowed`);

    default:
      throw new Error(`Access denied: No provisioning policy match for domain ${domain}`);
  }
};

/**
 * Handle existing credential user
 * @param {Object} credential - Existing credential
 * @param {Object} profile - User profile
 * @param {string} email - User email
 * @param {Object} db - Database models
 * @param {Object} authConfig - Auth config
 * @returns {Promise<Object>} User object
 */
const handleExistingCredentialUser = async (credential, profile, email, db, authConfig) => {
  const { user: User } = db;

  await credential.updateProfile(profile);
  const user = await User.findByPk(credential.user_id);

  if (!user || user.suspended) {
    throw new Error('User account is inactive');
  }

  if (!user.primary_organization_id) {
    const organizationId = await determineUserOrganization(email, db, authConfig);
    await user.update({
      primary_organization_id: organizationId,
      linkedAt: new Date(),
    });
  }

  return user;
};

/**
 * Handle existing email user
 * @param {Object} user - Existing user
 * @param {string} provider - Auth provider
 * @param {string} subject - User subject
 * @param {Object} profile - User profile
 * @param {string} email - User email
 * @param {string} normalizedProvider - Normalized provider name
 * @param {Object} db - Database models
 * @param {Object} authConfig - Auth config
 * @returns {Promise<Object>} User object
 */
const handleExistingEmailUser = async (
  user,
  provider,
  subject,
  profile,
  email,
  normalizedProvider,
  db,
  authConfig
) => {
  const { credential: Credential } = db;
  const baseProvider = provider.startsWith('oidc-') ? 'oidc' : provider;

  if (!user.primary_organization_id) {
    const organizationId = await determineUserOrganization(email, db, authConfig);
    await user.update({
      primary_organization_id: organizationId,
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

  await assignDefaultRoleIfNeeded(user, db, authConfig);

  return user;
};

/**
 * Create new external user
 * @param {string} provider - Auth provider
 * @param {Object} profile - User profile
 * @param {string} email - User email
 * @param {string} subject - User subject
 * @param {string} normalizedProvider - Normalized provider name
 * @param {Object} db - Database models
 * @param {Object} authConfig - Auth config
 * @returns {Promise<Object>} User object
 */
const createNewExternalUser = async (
  provider,
  profile,
  email,
  subject,
  normalizedProvider,
  db,
  authConfig
) => {
  const { user: User, credential: Credential } = db;

  const organizationId = await determineUserOrganization(email, db, authConfig);
  const baseProvider = provider.startsWith('oidc-') ? 'oidc' : provider;

  const user = await User.create({
    username: profile.displayName || profile.cn || email.split('@')[0],
    email,
    password: 'external',
    emailHash: createHash('sha256').update(email.toLowerCase()).digest('hex'),
    verified: true,
    primary_organization_id: organizationId,
    authProvider: baseProvider,
    externalId: subject,
    linkedAt: new Date(),
  });

  await assignDefaultRoleIfNeeded(user, db, authConfig);

  // Create user-organization relationship for external users
  const defaultRole = authConfig.auth?.external?.provisioning_default_role?.value || 'user';
  await db.UserOrg.create({
    user_id: user.id,
    organization_id: organizationId,
    role: defaultRole,
    is_primary: true,
  });

  await Credential.linkToUser(user.id, normalizedProvider, { ...profile, subject });

  return user;
};

/**
 * Handle external user authentication and provisioning
 * @param {string} provider - Authentication provider (ldap, oidc, etc.)
 * @param {Object} profile - User profile from external provider
 * @param {Object} db - Database models
 * @param {Object} authConfig - Authentication configuration
 * @returns {Promise<Object>} User object for authentication
 */
const handleExternalUser = async (provider, profile, db, authConfig) => {
  const { user: User, credential: Credential } = db;

  try {
    const email = profile.mail || profile.email || profile.emails?.[0]?.value;
    if (!email) {
      throw new Error(`No email found in ${provider} profile`);
    }

    let subject = profile.uid || profile.sub || profile.id || profile.cn;

    if (!subject && profile.dn) {
      const dnMatch =
        profile.dn.match(/^uid=(?<id>[^,]+)/i) || profile.dn.match(/^cn=(?<id>[^,]+)/i);
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
      return await handleExistingCredentialUser(credential, profile, email, db, authConfig);
    }

    // 2. Check if user exists by email
    const user = await User.findOne({ where: { email } });
    if (user) {
      return await handleExistingEmailUser(
        user,
        provider,
        subject,
        profile,
        email,
        normalizedProvider,
        db,
        authConfig
      );
    }

    // 3. New external user - apply provisioning policy
    return await createNewExternalUser(
      provider,
      profile,
      email,
      subject,
      normalizedProvider,
      db,
      authConfig
    );
  } catch (error) {
    log.error.error('External user handling failed:', error.message);
    throw error;
  }
};

export default {
  handleExternalUser,
  determineUserOrganization,
  generateOrgCode,
};
