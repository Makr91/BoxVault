import { log } from '../utils/Logger.js';
import { generateEmailHash, generateOrgCode, isHttpUrl } from '../utils/identity.js';
import { upsertExternalOrg } from '../utils/externalOrgs.js';

/**
 * Pick the per-org role from an auth-server organizations claim entry. The
 * claim vocabulary IS BoxVault's per-org enum — no translation, just
 * lowercase and highest privilege across overlapping roles.
 * @param {string[]|undefined} roles - Roles from the organizations claim
 * @returns {'owner'|'admin'|'member'}
 */
const pickOrgRole = roles => {
  const list = Array.isArray(roles) ? roles.map(r => String(r).toLowerCase()) : [];
  if (list.includes('owner')) {
    return 'owner';
  }
  if (list.includes('admin')) {
    return 'admin';
  }
  return 'member';
};

/**
 * Upsert the BoxVault org row that mirrors one org from the claim. The
 * slug/customer-id/collision/reconcile rules live in utils/externalOrgs.js —
 * the ONE home shared with the SCIM receiver.
 * @param {Object} db - Database models
 * @param {string} issuer
 * @param {Object} claimOrg - One entry from the organizations claim
 * @param {Object|null} transaction
 * @returns {Promise<Object>} Organization instance
 */
const upsertClaimOrg = (db, issuer, claimOrg, transaction) =>
  upsertExternalOrg(
    db,
    issuer,
    {
      uuid: claimOrg.uuid,
      name: claimOrg.name,
      customerId: claimOrg.customer_id,
      logo: claimOrg.logo,
      description: claimOrg.description,
    },
    transaction
  );

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
      const org = await upsertClaimOrg(db, issuer, claimOrg, transaction);
      const role = pickOrgRole(claimOrg.roles);
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
    const issuerOrgIds = externalOrgs.map(o => o.id);
    const staleOrgIds = issuerOrgIds.filter(id => !seenOrgIds.includes(id));

    if (staleOrgIds.length) {
      await UserOrg.destroy({
        where: {
          user_id: user.id,
          organization_id: { [db.Sequelize.Op.in]: staleOrgIds },
        },
        transaction,
      });

      // The pointer survives the membership it names unless it is cleared here,
      // and a dangling one is worse than none: it is published as the user's
      // organization and seeds every org-scoped request, each of which then 403s.
      if (staleOrgIds.includes(user.primary_organization_id)) {
        await user.update({ primary_organization_id: null }, { transaction });
      }
    }

    // Denormalized primary pointer. The claim's primary flag is authoritative
    // only among this issuer's orgs: the pointer may be set only when unset or
    // already on one of this issuer's orgs — never stolen from a
    // locally-created org or another issuer's org.
    const pointerReassignable =
      !user.primary_organization_id || issuerOrgIds.includes(user.primary_organization_id);
    if (primaryOrgId && pointerReassignable && user.primary_organization_id !== primaryOrgId) {
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
 * Whether this login carries an authoritative org membership list. Presence of
 * the claim decides it, never its contents: an empty array is the auth server
 * stating the user belongs to no organization, while an absent claim is a
 * provider that does not speak org membership at all.
 * @param {Object|null} profile - Token/userinfo claims
 * @param {string|null} issuer - Provider issuer (iss)
 * @returns {boolean}
 */
const hasOrganizationsClaim = (profile, issuer) =>
  Boolean(issuer) && Array.isArray(profile?.organizations);

/**
 * Resolve the primary org from an organizations claim.
 * @param {Object} db - Database models
 * @param {Object} profile - Token/userinfo claims (claim already confirmed present)
 * @param {string} issuer - Provider issuer (iss)
 * @returns {Promise<number|null>} Organization ID, or null when the claim lists none
 */
const resolveOrgFromClaim = async (db, profile, issuer) => {
  const primary = profile.organizations.find(o => o.primary) || profile.organizations[0];
  if (!primary?.uuid) {
    return null;
  }
  const org = await upsertClaimOrg(db, issuer, primary, null);
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
  await invitation.update({ accepted: true, accepted_at: new Date() });
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

    // Mappings are keyed by org_code (the stable identity key; names are
    // display/URL only). Find matching domain first, then do single await lookup.
    let matchedOrgCode = null;
    for (const [orgCode, domains] of Object.entries(mappings)) {
      if (Array.isArray(domains) && domains.includes(domain)) {
        matchedOrgCode = orgCode;
        break;
      }
    }

    if (matchedOrgCode) {
      const org = await db.organization.findOne({
        where: { org_code: matchedOrgCode.trim().toUpperCase() },
      });
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
        org_code: await generateOrgCode(db),
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
 * An organizations claim is the auth server's full desired state, so when one
 * is present it is the ONLY answer and the invite/domain/fallback machinery is
 * skipped entirely — a claim listing no orgs means the user has none here, and
 * BoxVault never mints one on the auth server's behalf. Full membership
 * reconciliation happens separately in syncOrganizationsFromClaim.
 *
 * @param {string} email - User email address
 * @param {Object} db - Database models
 * @param {Object} authConfig - Authentication configuration
 * @param {Object|null} profile - Token/userinfo claims
 * @param {string|null} issuer - Provider issuer (iss)
 * @returns {Promise<number|null>} Organization ID, or null for a user with none
 */
const determineUserOrganization = async (email, db, authConfig, profile = null, issuer = null) => {
  if (hasOrganizationsClaim(profile, issuer)) {
    return resolveOrgFromClaim(db, profile, issuer);
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
    if (organizationId) {
      await user.update({
        primary_organization_id: organizationId,
        linkedAt: new Date(),
      });
    }
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
 * @param {string} credentialProvider - Credential namespace (issuer URL for OIDC)
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
  credentialProvider,
  db,
  authConfig
) => {
  const { credential: Credential } = db;
  const baseProvider = provider.startsWith('oidc-') ? 'oidc' : provider;

  // #10: linking an OIDC identity to an EXISTING local account by email match
  // requires provider-verified mailbox ownership — the auth server's
  // email_verified claim is mailbox-truth. New-user creation is unaffected.
  if (profile.email_verified !== true) {
    log.error.error('Refusing to link external identity to existing account: email not verified', {
      provider,
      email,
      userId: user.id,
    });
    throw new Error(
      `Account linking denied: email ${email} is not verified by the identity provider`
    );
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
      ...(organizationId ? { primary_organization_id: organizationId } : {}),
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
    await Credential.linkToUser(user.id, credentialProvider, { ...profile, subject });
  } catch {
    // Credential might already exist
  }

  await assignDefaultRoleIfNeeded(user, db, authConfig);

  return user;
};

/**
 * Resolve the human display name from an external profile, trimmed. Absent or
 * blank means no name (null) — username stays the render fallback.
 * @param {Object} profile - User profile from external provider
 * @returns {string|null}
 */
const resolveDisplayName = profile => {
  const candidate = profile.name || profile.displayName || profile.cn;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
};

const trimmedClaim = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

// Both claims carry the same BCP 47 tag by contract. `preferences.language`
// is read first because the standard `locale` claim was hardcoded before the
// provider's 1.6.0 and an older deployment would otherwise pin everyone to
// one language.
const resolvePreferredLanguage = profile =>
  trimmedClaim(profile.preferences?.language) || trimmedClaim(profile.locale);

// OIDC Core §5.1 zoneinfo — the IANA name, omitted when the user has none.
const resolveTimezone = profile => trimmedClaim(profile.zoneinfo);

// Variant only. The brand pack belongs to the site, never to the user, so a
// composed value like "nomadservices-dark" is not a preference and is refused.
const THEME_PREFERENCES = ['light', 'dark', 'auto'];

const resolvePreferredTheme = profile => {
  const candidate = profile.preferences?.theme;
  return THEME_PREFERENCES.includes(candidate) ? candidate : null;
};

/**
 * Create new external user
 * @param {string} provider - Auth provider
 * @param {Object} profile - User profile
 * @param {string} email - User email
 * @param {string} subject - User subject
 * @param {string} credentialProvider - Credential namespace (issuer URL for OIDC)
 * @param {Object} db - Database models
 * @param {Object} authConfig - Auth config
 * @returns {Promise<Object>} User object
 */
const createNewExternalUser = async (
  provider,
  profile,
  email,
  subject,
  credentialProvider,
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
    name: resolveDisplayName(profile),
    preferredLanguage: resolvePreferredLanguage(profile),
    preferredTheme: resolvePreferredTheme(profile),
    timezone: resolveTimezone(profile),
    email,
    password: 'external',
    emailHash: generateEmailHash(email),
    verified: true,
    primary_organization_id: organizationId,
    authProvider: baseProvider,
    externalId: subject,
    linkedAt: new Date(),
  });

  await assignDefaultRoleIfNeeded(user, db, authConfig);

  // Create user-organization relationship for external users. The
  // provisioning_default_role knob speaks the GLOBAL role vocabulary and only
  // feeds assignDefaultRoleIfNeeded; the per-org membership starts as member
  // (claim-based providers overwrite it in syncOrganizationsFromClaim).
  if (organizationId) {
    await db.UserOrg.create({
      user_id: user.id,
      organization_id: organizationId,
      role: 'member',
      is_primary: true,
    });
  }

  await Credential.linkToUser(user.id, credentialProvider, { ...profile, subject });

  return user;
};

/**
 * Resolve the stable subject identifier from an external profile. Prefers the
 * custom UUID claim (never reassigned) over sub (currently the email, which
 * can change), falling back to sub/uid/id for generic OIDC providers that do
 * not emit a UUID claim, and finally to the uid/cn of an LDAP-style DN.
 * @param {Object} profile - User profile from external provider
 * @returns {string|undefined} Subject identifier or undefined
 */
const resolveSubject = profile => {
  let subject = profile.UUID || profile.uid || profile.sub || profile.id || profile.cn;

  if (!subject && profile.dn) {
    const dnMatch = profile.dn.match(/^uid=(?<id>[^,]+)/i) || profile.dn.match(/^cn=(?<id>[^,]+)/i);
    if (dnMatch) {
      const [, extractedSubject] = dnMatch;
      subject = extractedSubject;
    }
  }

  return subject;
};

/**
 * Resolve the credential namespace for a provider (#30): OIDC credentials are
 * namespaced by the REAL issuer so a second IdP can never collide on subject
 * values. The issuer comes from the token's iss claim, falling back to the
 * provider's configured issuer (identical by definition — discovery and token
 * validation pin the issuer). Non-OIDC providers keep their protocol name as
 * the namespace.
 * @param {string} provider - Authentication provider (ldap, oidc-<name>, etc.)
 * @param {Object} profile - User profile from external provider
 * @param {Object} authConfig - Authentication configuration
 * @returns {{isOidc: boolean, credentialProvider: string}}
 * @throws {Error} For an OIDC provider with no resolvable issuer
 */
const resolveCredentialNamespace = (provider, profile, authConfig) => {
  const isOidc = provider.startsWith('oidc-');
  const configuredIssuer = isOidc
    ? authConfig.auth?.oidc?.providers?.[provider.slice('oidc-'.length)]?.issuer?.value
    : null;
  const issuer = profile.iss || configuredIssuer || null;
  if (isOidc && !issuer) {
    throw new Error(`No issuer found for ${provider}: profile.iss and configured issuer missing`);
  }
  return { isOidc, credentialProvider: isOidc ? issuer : provider };
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

    const subject = resolveSubject(profile);
    if (!subject) {
      throw new Error(`No user identifier found in ${provider} profile`);
    }

    const { isOidc, credentialProvider } = resolveCredentialNamespace(
      provider,
      profile,
      authConfig
    );

    // Resolve the user via one of three paths. findByIssuerAndSubject also
    // backfills pre-issuer rows stored under the flat 'oidc' value.
    let user;
    const credential = isOidc
      ? await Credential.findByIssuerAndSubject(credentialProvider, subject)
      : await Credential.findByProviderAndSubject(credentialProvider, subject);
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
          credentialProvider,
          db,
          authConfig
        );
      } else {
        user = await createNewExternalUser(
          provider,
          profile,
          email,
          subject,
          credentialProvider,
          db,
          authConfig
        );
      }
    }

    // Login tier of the avatar contract: a valid picture claim is fresher than
    // the SCIM-provisioned photos value and overwrites it; the email-hash
    // gravatar remains the render-time fallback when neither tier set a value.
    if (isHttpUrl(profile.picture) && user.avatar_url !== profile.picture) {
      await user.update({ avatar_url: profile.picture });
    }

    // Same tier rule for the display name: a name claim at login is fresher
    // than the SCIM-provisioned value and overwrites it.
    const displayName = resolveDisplayName(profile);
    if (displayName && user.name !== displayName) {
      await user.update({ name: displayName });
    }

    const preferredLanguage = resolvePreferredLanguage(profile);
    if (preferredLanguage && user.preferredLanguage !== preferredLanguage) {
      await user.update({ preferredLanguage });
    }

    const preferredTheme = resolvePreferredTheme(profile);
    if (preferredTheme && user.preferredTheme !== preferredTheme) {
      await user.update({ preferredTheme });
    }

    const timezone = resolveTimezone(profile);
    if (timezone && user.timezone !== timezone) {
      await user.update({ timezone });
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
};
