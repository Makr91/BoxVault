import { createHash } from 'crypto';
import { log } from '../utils/Logger.js';

/**
 * Generate a random organization code
 * @returns {string} Random 6-character hexcode
 */
const generateOrgCode = () => Math.random().toString(16).substr(2, 6).toUpperCase();

/**
 * Map an auth-server org role (OWNER/ADMIN/MEMBER) to BoxVault's per-org role enum.
 * @param {string[]|undefined} roles - Roles from the organizations claim
 * @returns {'admin'|'moderator'|'user'}
 */
const mapOrgRole = roles => {
  const list = Array.isArray(roles) ? roles.map(r => String(r).toUpperCase()) : [];
  if (list.includes('OWNER')) {
    return 'admin';
  }
  if (list.includes('ADMIN')) {
    return 'moderator';
  }
  return 'user';
};

/**
 * Turn a (mutable, possibly non-URL-safe) upstream org name into a slug that
 * matches BoxVault's org-name rules ([A-Za-z0-9.-]) since the name is used as
 * the URL path segment for the org.
 * @param {string} name
 * @param {string} externalOrgId - Fallback seed if the name slugs to empty
 * @returns {string}
 */
const slugifyOrgName = (name, externalOrgId) => {
  const slug = (name || '')
    .trim()
    .replace(/[^A-Za-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || `org-${externalOrgId.slice(0, 8)}`;
};

/**
 * Find a unique, URL-safe org name. BoxVault org names are globally unique (they
 * are the URL slug), but upstream names are neither unique nor stable, so on a
 * collision we disambiguate with a fragment of the immutable org UUID.
 * @param {Object} Organization - Sequelize model
 * @param {string} desired - Upstream org name
 * @param {string} externalOrgId - Immutable org UUID
 * @param {number|null} selfOrgId - Existing org id to treat as non-conflicting
 * @param {Object|null} transaction
 * @returns {Promise<string>}
 */
const findFreeOrgName = async (Organization, desired, externalOrgId, selfOrgId, transaction) => {
  const base = slugifyOrgName(desired, externalOrgId);
  const opts = transaction ? { transaction } : {};
  const candidates = [
    base,
    `${base}-${externalOrgId.slice(0, 6)}`,
    `${base}-${externalOrgId.slice(0, 12)}`,
  ];
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop -- sequential uniqueness probing is intentional
    const clash = await Organization.findOne({ where: { name: candidate }, ...opts });
    if (!clash || clash.id === selfOrgId) {
      return candidate;
    }
  }
  return `${base}-${externalOrgId}`;
};

/**
 * Upsert the BoxVault org row that mirrors one org from the claim, keyed on
 * (external_issuer, external_org_id). Keeps the name loosely in sync with the
 * upstream (mutable) name without ever colliding.
 * @param {Object} Organization - Sequelize model
 * @param {string} issuer
 * @param {Object} claimOrg - One entry from the organizations claim
 * @param {Object|null} transaction
 * @returns {Promise<Object>} Organization instance
 */
const upsertClaimOrg = async (Organization, issuer, claimOrg, transaction) => {
  const externalOrgId = claimOrg.uuid;
  const opts = transaction ? { transaction } : {};

  let org = await Organization.findOne({
    where: { external_issuer: issuer, external_org_id: externalOrgId },
    ...opts,
  });

  if (!org) {
    // Slug is frozen at creation (stable URLs forever); display_name carries the
    // mutable upstream name from here on.
    const name = await findFreeOrgName(
      Organization,
      claimOrg.name,
      externalOrgId,
      null,
      transaction
    );
    org = await Organization.create(
      {
        name,
        display_name: claimOrg.name || name,
        external_issuer: issuer,
        external_org_id: externalOrgId,
        org_code: generateOrgCode(),
      },
      opts
    );
    return org;
  }

  // Existing mirror row — never re-slugify; only refresh the display name.
  if (claimOrg.name && org.display_name !== claimOrg.name) {
    await org.update({ display_name: claimOrg.name }, opts);
  }
  return org;
};

/**
 * Sync a user's org memberships from the organizations claim (auth-server is the
 * source of truth). Exact mirror: adds/updates memberships in this issuer's orgs
 * and REMOVES memberships in this issuer's orgs that are no longer in the claim.
 * Never touches locally-created orgs or orgs from a different issuer.
 * @param {Object} user - User instance
 * @param {Object} profile - Token/userinfo claims (must carry `organizations`)
 * @param {string|null} issuer - The provider issuer (iss)
 * @param {Object} db - Database models
 * @returns {Promise<void>}
 */
const syncOrganizationsFromClaim = async (user, profile, issuer, db) => {
  const { organization: Organization, UserOrg } = db;

  // No claim -> leave local/other provisioning machinery alone (Track C: generic
  // OIDC providers and self-hosted installs without the auth-server).
  if (!Array.isArray(profile.organizations)) {
    return;
  }
  if (!issuer) {
    log.error.error('Organizations claim present but no issuer; skipping org sync', {
      userId: user.id,
    });
    return;
  }

  const transaction = await db.sequelize.transaction();
  try {
    const seenOrgIds = [];
    let primaryOrgId = null;

    for (const claimOrg of profile.organizations) {
      if (!claimOrg?.uuid) {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop -- memberships upserted sequentially in one txn
      const org = await upsertClaimOrg(Organization, issuer, claimOrg, transaction);
      const role = mapOrgRole(claimOrg.roles);
      const isPrimary = !!claimOrg.primary;

      // eslint-disable-next-line no-await-in-loop
      const membership = await UserOrg.findOne({
        where: { user_id: user.id, organization_id: org.id },
        transaction,
      });

      if (membership) {
        if (membership.role !== role || membership.is_primary !== isPrimary) {
          // eslint-disable-next-line no-await-in-loop
          await membership.update({ role, is_primary: isPrimary }, { transaction });
        }
      } else {
        // eslint-disable-next-line no-await-in-loop
        await UserOrg.create(
          {
            user_id: user.id,
            organization_id: org.id,
            role,
            is_primary: isPrimary,
          },
          { transaction }
        );
      }

      seenOrgIds.push(org.id);
      if (isPrimary) {
        primaryOrgId = org.id;
      }
    }

    // Exact mirror: drop memberships in THIS issuer's external orgs not in the claim.
    const externalOrgs = await Organization.findAll({
      where: { external_issuer: issuer },
      attributes: ['id'],
      transaction,
    });
    const staleOrgIds = externalOrgs.map(o => o.id).filter(id => !seenOrgIds.includes(id));

    if (staleOrgIds.length) {
      await UserOrg.destroy({
        where: {
          user_id: user.id,
          organization_id: { [db.Sequelize.Op.in]: staleOrgIds },
        },
        transaction,
      });
    }

    // Denormalized primary pointer.
    if (primaryOrgId && user.primary_organization_id !== primaryOrgId) {
      await user.update({ primary_organization_id: primaryOrgId }, { transaction });
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    log.error.error('Organization sync from claim failed', {
      error: error.message,
      userId: user.id,
    });
    throw error;
  }
};

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
 * Resolve the primary org from an organizations claim, if one is present.
 * @param {Object} db - Database models
 * @param {Object|null} profile - Token/userinfo claims
 * @param {string|null} issuer - Provider issuer (iss)
 * @returns {Promise<number|null>} Organization ID or null when no usable claim
 */
const resolveOrgFromClaim = async (db, profile, issuer) => {
  if (!issuer || !Array.isArray(profile?.organizations) || !profile.organizations.length) {
    return null;
  }
  const primary = profile.organizations.find(o => o.primary) || profile.organizations[0];
  if (!primary?.uuid) {
    return null;
  }
  const org = await upsertClaimOrg(db.organization, issuer, primary, null);
  return org.id;
};

/**
 * Resolve an org from a pending invitation for this email, consuming the invite.
 * @param {string} email - User email address
 * @param {Object} db - Database models
 * @returns {Promise<number|null>} Organization ID or null
 */
const resolveOrgFromInvitation = async (email, db) => {
  const invitation = await db.invitation.findOne({
    where: {
      email,
      accepted: false,
      expired: false,
      expires: {
        [db.Sequelize.Op.gt]: new Date(),
      },
    },
  });

  if (!invitation) {
    return null;
  }
  await invitation.update({ accepted: true });
  return invitation.organizationId;
};

/**
 * Resolve an org from the configured email-domain mappings.
 * @param {string} domain - Email domain
 * @param {Object} db - Database models
 * @param {Object} authConfig - Authentication configuration
 * @returns {Promise<number|null>} Organization ID or null
 */
const resolveOrgFromDomainMapping = async (domain, db, authConfig) => {
  if (!authConfig.auth?.external?.domain_mapping_enabled?.value) {
    return null;
  }

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
      const org = await db.organization.findOne({ where: { name: matchedOrgName } });
      if (org) {
        return org.id;
      }
    }
  } catch (error) {
    log.error.error('Failed to parse domain mappings JSON:', error.message);
  }
  return null;
};

/**
 * Apply the provisioning fallback policy when no other resolution matched.
 * @param {string} domain - Email domain
 * @param {Object} db - Database models
 * @param {Object} authConfig - Authentication configuration
 * @returns {Promise<number>} Organization ID
 * @throws {Error} When the policy denies access
 */
const applyProvisioningFallback = async (domain, db, authConfig) => {
  const fallbackAction =
    authConfig.auth?.external?.provisioning_fallback_action?.value || 'require_invite';

  switch (fallbackAction) {
    case 'require_invite':
      throw new Error(`Access denied: Invitation required for domain ${domain}`);

    case 'create_org': {
      const newOrg = await db.organization.create({
        name: domain,
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
 * Determine organization for external user.
 *
 * When the token carries an organizations claim, the auth-server is the source
 * of truth: resolve (and lazily create) the primary org from the claim BEFORE
 * the invite/domain/fallback machinery. Full membership reconciliation happens
 * separately in syncOrganizationsFromClaim.
 *
 * @param {string} email - User email address
 * @param {Object} db - Database models
 * @param {Object} authConfig - Authentication configuration
 * @param {Object|null} profile - Token/userinfo claims
 * @param {string|null} issuer - Provider issuer (iss)
 * @returns {Promise<number>} Organization ID
 */
const determineUserOrganization = async (email, db, authConfig, profile = null, issuer = null) => {
  // 0. Claim-based (auth-server source of truth)
  const claimOrgId = await resolveOrgFromClaim(db, profile, issuer);
  if (claimOrgId) {
    return claimOrgId;
  }

  const [, domain] = email.split('@');

  // 1. Pending invitation
  const invitedOrgId = await resolveOrgFromInvitation(email, db);
  if (invitedOrgId) {
    return invitedOrgId;
  }

  // 2. Email-domain mapping
  const mappedOrgId = await resolveOrgFromDomainMapping(domain, db, authConfig);
  if (mappedOrgId) {
    return mappedOrgId;
  }

  // 3. Fallback policy
  return applyProvisioningFallback(domain, db, authConfig);
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
    const organizationId = await determineUserOrganization(
      email,
      db,
      authConfig,
      profile,
      profile.iss || null
    );
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
    const organizationId = await determineUserOrganization(
      email,
      db,
      authConfig,
      profile,
      profile.iss || null
    );
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

  const organizationId = await determineUserOrganization(
    email,
    db,
    authConfig,
    profile,
    profile.iss || null
  );
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

    // Prefer the stable custom UUID claim (never reassigned) over sub (currently
    // the email, which can change). Fall back to sub/uid/id for generic OIDC
    // providers that do not emit a UUID claim.
    let subject = profile.UUID || profile.uid || profile.sub || profile.id || profile.cn;

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

    // Resolve the user via one of three paths.
    let user;
    const credential = await Credential.findByProviderAndSubject(normalizedProvider, subject);
    if (credential) {
      user = await handleExistingCredentialUser(credential, profile, email, db, authConfig);
    } else {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        user = await handleExistingEmailUser(
          existingUser,
          provider,
          subject,
          profile,
          email,
          normalizedProvider,
          db,
          authConfig
        );
      } else {
        user = await createNewExternalUser(
          provider,
          profile,
          email,
          subject,
          normalizedProvider,
          db,
          authConfig
        );
      }
    }

    // Reconcile all org memberships from the claim (auth-server source of truth).
    // No-op when the profile carries no organizations claim.
    await syncOrganizationsFromClaim(user, profile, profile.iss || null, db);

    return user;
  } catch (error) {
    log.error.error('External user handling failed:', error.message);
    throw error;
  }
};

export default {
  handleExternalUser,
  determineUserOrganization,
  syncOrganizationsFromClaim,
  generateOrgCode,
};
