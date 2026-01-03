const db = require('../models');
const { log } = require('../utils/Logger');
const User = db.user;
const { UserOrg } = db;

/**
 * Middleware to verify user has membership in the organization specified in route
 */
const isOrgMember = async (req, res, next) => {
  try {
    const { organization: orgName } = req.params;

    if (!orgName) {
      return res.status(400).send({ message: 'Organization parameter required!' });
    }

    // Service accounts use organization-scoped tokens
    if (req.isServiceAccount) {
      const serviceAccount = await db.service_account.findOne({
        where: { userId: req.userId },
        include: [
          {
            model: db.organization,
            as: 'organization',
            where: { name: orgName },
          },
        ],
      });

      if (!serviceAccount) {
        return res.status(403).send({
          message: 'Service account not authorized for this organization!',
        });
      }

      return next();
    }

    // Regular user membership check
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({ message: 'User not found!' });
    }

    const organization = await db.organization.findOne({ where: { name: orgName } });
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
 * Middleware to verify user has moderator role in organization
 */
const isOrgModerator = async (req, res, next) => {
  try {
    const { organization: orgName } = req.params;

    if (!orgName) {
      return res.status(400).send({ message: 'Organization parameter required!' });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(401).send({ message: 'User not found!' });
    }

    const organization = await db.organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    const hasRole = await UserOrg.hasRole(user.id, organization.id, ['moderator', 'admin']);
    if (!hasRole) {
      return res.status(403).send({
        message: 'Require Moderator or Admin role in this organization!',
      });
    }

    // Attach org context to request
    req.organizationId = organization.id;

    return next();
  } catch (err) {
    log.error.error('Org moderator check error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
      organization: req.params.organization,
    });
    return res.status(500).send({ message: 'Error checking organization permissions' });
  }
};

/**
 * Middleware to verify user has admin role in organization
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

    const organization = await db.organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    const hasRole = await UserOrg.hasRole(user.id, organization.id, 'admin');
    if (!hasRole) {
      return res.status(403).send({
        message: 'Require Admin role in this organization!',
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
 * Middleware to verify user has moderator or admin role in organization
 */
const isOrgModeratorOrAdmin = async (req, res, next) => {
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

    const organization = await db.organization.findOne({ where: { name: orgName } });
    if (!organization) {
      return res.status(404).send({ message: 'Organization not found!' });
    }

    if (isGlobalAdmin) {
      // Global admins can access any organization
      req.organizationId = organization.id;
      req.userOrgRole = 'admin'; // Treat as org admin
      return next();
    }

    // Check org-specific role
    const hasRole = await UserOrg.hasRole(user.id, organization.id, ['moderator', 'admin']);
    if (!hasRole) {
      return res.status(403).send({
        message: 'Require Moderator or Admin role in this organization!',
      });
    }

    // Attach org context to request
    req.organizationId = organization.id;

    return next();
  } catch (err) {
    log.error.error('Org moderator/admin check error:', {
      error: err.message,
      stack: err.stack,
      userId: req.userId,
      organization: req.params.organization,
    });
    return res.status(500).send({ message: 'Error checking organization permissions' });
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
    const organization = await db.organization.findOne({ where: { name: orgName } });
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

const verifyOrgAccess = {
  isOrgMember,
  isOrgModerator,
  isOrgAdmin,
  isOrgModeratorOrAdmin,
  getUserOrgContext,
};

module.exports = verifyOrgAccess;
