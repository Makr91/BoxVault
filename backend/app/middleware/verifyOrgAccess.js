import db from '../models/index.js';
import { log } from '../utils/Logger.js';
import { problem } from '../utils/problem.js';
import {
  holdsGlobalAdmin,
  resolveOrgMembership,
  serviceAccountIsSuperadmin,
} from '../utils/orgMembership.js';
const {
  user: User,
  organization: Organization,
  UserOrg,
  box: Box,
  iso: ISO,
  versions: Version,
  providers: Provider,
} = db;

const MANAGING_ROLES = ['admin', 'owner'];

const parameterRequired = (req, res) =>
  problem(res, req, {
    status: 400,
    type: 'bad-request',
    title: req.__('organizations.parameterRequired'),
  });

const userNotFound = (req, res) =>
  problem(res, req, {
    status: 401,
    type: 'authentication',
    title: req.__('users.userNotFound'),
  });

const forbidden = (req, res, key) =>
  problem(res, req, { status: 403, type: 'forbidden', title: req.__(key) });

const notFound = (req, res, title) => problem(res, req, { status: 404, type: 'not-found', title });

const internal = (req, res, key) =>
  problem(res, req, { status: 500, type: 'internal', title: req.__(key) });

/**
 * Whether the caller acts as a global admin: a user holding ROLE_ADMIN, or a
 * live superadmin service account; any other service account never does,
 * whatever its owner's global role.
 * @param {import('express').Request} req - The request
 * @param {Object} user - The requesting user
 * @returns {Promise<boolean>} True for a global admin
 */
const isGlobalAdmin = (req, user) =>
  req.isServiceAccount ? serviceAccountIsSuperadmin(req.serviceAccountId) : holdsGlobalAdmin(user);

/**
 * Middleware to verify user has membership in the organization specified in route
 */
const isOrgMember = async (req, res, next) => {
  try {
    const { organization: orgName } = req.params;

    if (!orgName) {
      return parameterRequired(req, res);
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return userNotFound(req, res);
    }

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return notFound(req, res, req.__('organizations.organizationNotFound'));
    }

    const membership = await resolveOrgMembership(req, organization.id);
    if (!membership) {
      return forbidden(req, res, 'organizations.userNotMember');
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
    return internal(req, res, 'organizations.membershipCheckError');
  }
};

/**
 * Middleware to verify user has admin or owner role in organization
 */
const isOrgAdmin = async (req, res, next) => {
  try {
    const { organization: orgName } = req.params;

    if (!orgName) {
      return parameterRequired(req, res);
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return userNotFound(req, res);
    }

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return notFound(req, res, req.__('organizations.organizationNotFound'));
    }

    if (await isGlobalAdmin(req, user)) {
      req.organizationId = organization.id;
      req.userOrgRole = 'owner';
      return next();
    }

    const membership = await resolveOrgMembership(req, organization.id);
    if (!membership || !MANAGING_ROLES.includes(membership.role)) {
      return forbidden(req, res, 'organizations.requireAdminOrOwner');
    }

    req.organizationId = organization.id;
    req.userOrgRole = membership.role;

    return next();
  } catch (err) {
    log.error.error('Org admin check error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
      organization: req.params.organization,
    });
    return internal(req, res, 'organizations.permissionCheckError');
  }
};

/**
 * Middleware to verify user has owner role in organization
 */
const isOrgOwner = async (req, res, next) => {
  try {
    const { organization: orgName } = req.params;

    if (!orgName) {
      return parameterRequired(req, res);
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return userNotFound(req, res);
    }

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return notFound(req, res, req.__('organizations.organizationNotFound'));
    }

    if (await isGlobalAdmin(req, user)) {
      req.organizationId = organization.id;
      req.userOrgRole = 'owner';
      return next();
    }

    const membership = await resolveOrgMembership(req, organization.id);
    if (!membership || membership.role !== 'owner') {
      return forbidden(req, res, 'organizations.requireOwner');
    }

    req.organizationId = organization.id;
    req.userOrgRole = membership.role;

    return next();
  } catch (err) {
    log.error.error('Org owner check error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
      organization: req.params.organization,
    });
    return internal(req, res, 'organizations.permissionCheckError');
  }
};

/**
 * Middleware to verify user has admin or owner role in organization.
 * Resolves the org from req.params.organization or req.body.organization_name
 * (same resolution as rejectExternallyManagedOrg) so body-driven routes like
 * POST /auth/invite can be gated per-org too.
 */
const isOrgAdminOrOwner = async (req, res, next) => {
  try {
    const orgName = req.params.organization || req.body?.organization_name;

    if (!orgName) {
      return parameterRequired(req, res);
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return userNotFound(req, res);
    }

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return notFound(req, res, req.__('organizations.organizationNotFound'));
    }

    if (await isGlobalAdmin(req, user)) {
      req.organizationId = organization.id;
      req.userOrgRole = 'owner';
      return next();
    }

    const membership = await resolveOrgMembership(req, organization.id);
    if (!membership || !MANAGING_ROLES.includes(membership.role)) {
      return forbidden(req, res, 'organizations.requireAdminOrOwner');
    }

    req.organizationId = organization.id;
    req.userOrgRole = membership.role;

    return next();
  } catch (err) {
    log.error.error('Org admin/owner check error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
      organization: req.params.organization,
    });
    return internal(req, res, 'organizations.permissionCheckError');
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
 * Resolves the org from req.params.organization or req.body.organization_name.
 * Falls through when the org doesn't exist (later middleware handles 404).
 */
const rejectExternallyManagedOrg = async (req, res, next) => {
  try {
    const orgName = req.params.organization || req.body?.organization_name;

    const organization = await Organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return next();
    }

    if (organization.external_issuer) {
      return forbidden(req, res, 'organizations.externallyManaged');
    }

    return next();
  } catch (err) {
    log.error.error('External-org write guard error:', {
      error: err.message,
      stack: err.stack,
      organization: req.params.organization || req.body?.organization_name,
    });
    return internal(req, res, 'organizations.managementCheckError');
  }
};

/**
 * Middleware resolving the organization and box named by the route and
 * attaching them as req.organizationData and req.boxData; 404 when either is missing.
 */
const attachBox = async (req, res, next) => {
  const { organization, boxId } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return notFound(
        req,
        res,
        req.__('organizations.organizationNotFoundWithName', { organization })
      );
    }

    const box = await Box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return notFound(req, res, req.__('boxes.boxNotFoundInOrg', { boxId, organization }));
    }

    req.organizationData = organizationData;
    req.boxData = box;

    return next();
  } catch (err) {
    log.error.error('Error attaching box entities:', err);
    return internal(req, res, 'errors.operationFailed');
  }
};

/**
 * Middleware resolving the version and provider named by the route beneath
 * req.boxData and attaching them as req.versionData and req.providerData; 404
 * when either is missing. The provider is resolved only when the route names one.
 */
const attachProvider = async (req, res, next) => {
  const { organization, boxId, versionNumber, providerName } = req.params;

  try {
    const version = await Version.findOne({
      where: { versionNumber, boxId: req.boxData.id },
    });

    if (!version) {
      return notFound(
        req,
        res,
        req.__('versions.versionNotFoundInBox', { versionNumber, boxId, organization })
      );
    }

    req.versionData = version;

    if (providerName === undefined) {
      return next();
    }

    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id },
    });

    if (!provider) {
      return notFound(
        req,
        res,
        req.__('providers.providerNotFoundInVersion', { providerName, versionNumber, boxId })
      );
    }

    req.providerData = provider;

    return next();
  } catch (err) {
    log.error.error('Error attaching provider entities:', err);
    return internal(req, res, 'errors.operationFailed');
  }
};

/**
 * Middleware resolving the organization and ISO named by the route and
 * attaching them as req.organizationData and req.isoData; 404 when either is missing.
 */
const attachIso = async (req, res, next) => {
  const { organization, name } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return notFound(
        req,
        res,
        req.__('organizations.organizationNotFoundWithName', { organization })
      );
    }

    const iso = await ISO.findOne({
      where: { name, organizationId: organizationData.id },
    });

    if (!iso) {
      return notFound(req, res, req.__('isos.notFoundWithName', { name, organization }));
    }

    req.organizationData = organizationData;
    req.isoData = iso;

    return next();
  } catch (err) {
    log.error.error('Error attaching ISO entities:', err);
    return internal(req, res, 'errors.operationFailed');
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
  attachBox,
  attachProvider,
  attachIso,
  getUserOrgContext,
};
