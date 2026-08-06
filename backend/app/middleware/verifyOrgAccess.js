import db from '../models/index.js';
import { log } from '../utils/Logger.js';
const { user: User, organization: Organization, UserOrg } = db;

/**
 * Middleware to verify user has membership in the organization specified in route
 */
const isOrgMember = async (req, res, next) => {
  try {
    const { organization: orgName } = req.params;

    if (!orgName) {
      return res.status(400).send({ message: 'Organization parameter required!' });
    }

    // Membership check — service accounts impersonate their owning user
    // (req.userId is the owning user's id), so they take the same path.
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({ message: 'User not found!' });
    }

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    const membership = await UserOrg.findUserOrgRole(user.id, organization.id);
    if (!membership) {
      return res.status(403).send({
        message: 'User is not a member of this organization!',
      });
    }

    // Attach org context to request for use in controllers
    req.userOrgRole = membership.role;
    req.organizationId = organization.id;

    return next();
  } catch (err) {
    log.error.error('Org membership check error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
      organization: req.params.organization,
    });
    return res.status(500).send({ message: 'Error checking organization membership' });
  }
};

/**
 * Middleware to verify user has admin or owner role in organization
 */
const isOrgAdmin = async (req, res, next) => {
  try {
    const { organization: orgName } = req.params;

    if (!orgName) {
      return res.status(400).send({ message: 'Organization parameter required!' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({ message: 'User not found!' });
    }

    // Check if user is global admin first (bypasses org-specific checks)
    const globalRoles = await user.getRoles();
    const isGlobalAdmin = globalRoles.some(role => role.name === 'admin');

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    if (isGlobalAdmin) {
      // Global admins can access any organization
      req.organizationId = organization.id;
      req.userOrgRole = 'owner';
      return next();
    }

    const hasRole = await UserOrg.hasRole(user.id, organization.id, ['admin', 'owner']);
    if (!hasRole) {
      return res.status(403).send({
        message: 'Require Admin or Owner role in this organization!',
      });
    }

    // Attach org context to request
    req.organizationId = organization.id;

    return next();
  } catch (err) {
    log.error.error('Org admin check error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
      organization: req.params.organization,
    });
    return res.status(500).send({ message: 'Error checking organization permissions' });
  }
};

/**
 * Middleware to verify user has owner role in organization
 */
const isOrgOwner = async (req, res, next) => {
  try {
    const { organization: orgName } = req.params;

    if (!orgName) {
      return res.status(400).send({ message: 'Organization parameter required!' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({ message: 'User not found!' });
    }

    // Check if user is global admin first (bypasses org-specific checks)
    const globalRoles = await user.getRoles();
    const isGlobalAdmin = globalRoles.some(role => role.name === 'admin');

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    if (isGlobalAdmin) {
      // Global admins can access any organization
      req.organizationId = organization.id;
      req.userOrgRole = 'owner';
      return next();
    }

    const hasRole = await UserOrg.hasRole(user.id, organization.id, 'owner');
    if (!hasRole) {
      return res.status(403).send({
        message: 'Require Owner role in this organization!',
      });
    }

    // Attach org context to request
    req.organizationId = organization.id;

    return next();
  } catch (err) {
    log.error.error('Org owner check error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
      organization: req.params.organization,
    });
    return res.status(500).send({ message: 'Error checking organization permissions' });
  }
};

/**
 * Middleware to verify user has admin or owner role in organization.
 * Resolves the org from req.params.organization or req.body.organizationName
 * (same resolution as rejectExternallyManagedOrg) so body-driven routes like
 * POST /auth/invite can be gated per-org too.
 */
const isOrgAdminOrOwner = async (req, res, next) => {
  try {
    const orgName = req.params.organization || req.body?.organizationName;

    if (!orgName) {
      return res.status(400).send({ message: 'Organization parameter required!' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({ message: 'User not found!' });
    }

    // Check if user is global admin first (bypasses org-specific checks)
    const globalRoles = await user.getRoles();
    const isGlobalAdmin = globalRoles.some(role => role.name === 'admin');

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    if (isGlobalAdmin) {
      // Global admins can access any organization
      req.organizationId = organization.id;
      req.userOrgRole = 'owner'; // Treat as org owner
      return next();
    }

    // Check org-specific role
    const hasRole = await UserOrg.hasRole(user.id, organization.id, ['admin', 'owner']);
    if (!hasRole) {
      return res.status(403).send({
        message: 'Require Admin or Owner role in this organization!',
      });
    }

    // Attach org context to request
    req.organizationId = organization.id;

    return next();
  } catch (err) {
    log.error.error('Org admin/owner check error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
      organization: req.params.organization,
    });
    return res.status(500).send({ message: 'Error checking organization permissions' });
  }
};

/**
 * Middleware to reject membership/lifecycle writes on externally-managed orgs.
 *
 * Orgs with external_issuer set are mirrors of an OIDC provider's orgs: their
 * membership, roles, and lifecycle are managed on the auth-server and re-synced
 * on every login — local writes would be silently overwritten. Local orgs
 * (external_issuer null) are unaffected.
 *
 * Resolves the org from req.params.organization or req.body.organizationName.
 * Falls through when the org doesn't exist (later middleware handles 404).
 */
const rejectExternallyManagedOrg = async (req, res, next) => {
  try {
    const orgName = req.params.organization || req.body?.organizationName;

    if (!orgName) {
      return next();
    }

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return next();
    }

    if (organization.external_issuer) {
      return res.status(403).send({
        message: req.__('organizations.externallyManaged'),
      });
    }

    return next();
  } catch (err) {
    log.error.error('External-org write guard error:', {
      error: err.message,
      stack: err.stack,
      organization: req.params.organization || req.body?.organizationName,
    });
    return res.status(500).send({ message: 'Error checking organization management source' });
  }
};

/**
 * Helper function to get user's role in organization (for controllers)
 * @param {number} userId - User ID
 * @param {string} orgName - Organization name
 * @returns {Promise<{role: string, organizationId: number}|null>}
 */
const getUserOrgContext = async (userId, orgName) => {
  try {
    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return null;
    }

    const membership = await UserOrg.findUserOrgRole(userId, organization.id);
    if (!membership) {
      return null;
    }

    return {
      role: membership.role,
      organizationId: organization.id,
      organization,
    };
  } catch (error) {
    log.error.error('Error getting user org context:', error);
    return null;
  }
};

export {
  isOrgMember,
  isOrgAdmin,
  isOrgOwner,
  isOrgAdminOrOwner,
  rejectExternallyManagedOrg,
  getUserOrgContext,
};
