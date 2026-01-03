/**
 * UserOrg Model
 * Junction table for many-to-many relationship between Users and Organizations
 * Stores per-organization roles for users
 */
module.exports = (sequelize, Sequelize) => {
  const UserOrg = sequelize.define(
    'UserOrg',
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: 'Unique user-organization relationship identifier',
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Reference to users table',
        field: 'user_id',
      },
      organization_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'organizations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Reference to organizations table',
        field: 'organization_id',
      },
      role: {
        type: Sequelize.ENUM('user', 'moderator', 'admin'),
        allowNull: false,
        defaultValue: 'user',
        comment: 'User role within this specific organization',
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Whether this is the users primary/default organization',
        field: 'is_primary',
      },
      joined_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: 'When the user joined this organization',
        field: 'joined_at',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field: 'created_at',
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        field: 'updated_at',
      },
    },
    {
      tableName: 'user_organizations',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'organization_id'],
          name: 'unique_user_org',
        },
        {
          fields: ['user_id'],
          name: 'idx_user_organizations_user_id',
        },
        {
          fields: ['organization_id'],
          name: 'idx_user_organizations_org_id',
        },
        {
          fields: ['is_primary'],
          name: 'idx_user_organizations_primary',
        },
      ],
      comment: 'Many-to-many relationship between users and organizations with roles',
    }
  );

  /**
   * Class methods
   */

  /**
   * Find user's role in specific organization
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<UserOrg|null>}
   */
  UserOrg.findUserOrgRole = function (userId, organizationId) {
    return this.findOne({
      where: { user_id: userId, organization_id: organizationId },
    });
  };

  /**
   * Get all organizations for a user with roles
   * @param {number} userId - User ID
   * @returns {Promise<UserOrg[]>}
   */
  UserOrg.getUserOrganizations = async function (userId) {
    // Use raw query approach to avoid association issues
    const results = await this.findAll({
      where: { user_id: userId },
      order: [
        ['is_primary', 'DESC'],
        ['joined_at', 'ASC'],
      ],
    });

    // Load organizations in parallel
    const db = require('./index');
    await Promise.all(
      results.map(async result => {
        result.organization = await db.organization.findByPk(result.organization_id, {
          attributes: ['id', 'name', 'description', 'access_mode', 'emailHash'],
        });
      })
    );

    return results;
  };

  /**
   * Get user's primary organization
   * @param {number} userId - User ID
   * @returns {Promise<UserOrg|null>}
   */
  UserOrg.getPrimaryOrganization = function (userId) {
    return this.findOne({
      where: { user_id: userId, is_primary: true },
      include: [
        {
          model: sequelize.models.organization,
          as: 'organization',
        },
      ],
    });
  };

  /**
   * Set primary organization for user (ensures only one primary)
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID to set as primary
   * @returns {Promise<void>}
   */
  UserOrg.setPrimaryOrganization = async function (userId, organizationId) {
    const transaction = await sequelize.transaction();

    try {
      // Remove primary flag from all user's organizations
      await this.update(
        { is_primary: false },
        {
          where: { user_id: userId },
          transaction,
        }
      );

      // Set new primary organization
      await this.update(
        { is_primary: true },
        {
          where: { user_id: userId, organization_id: organizationId },
          transaction,
        }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  /**
   * Check if user has specific role in organization
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @param {string|string[]} requiredRole - Role(s) to check for
   * @returns {Promise<boolean>}
   */
  UserOrg.hasRole = async function (userId, organizationId, requiredRole) {
    const membership = await this.findUserOrgRole(userId, organizationId);
    if (!membership) {
      return false;
    }

    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    return roles.includes(membership.role);
  };

  /**
   * Get all users in organization with their roles
   * @param {number} organizationId - Organization ID
   * @returns {Promise<UserOrg[]>}
   */
  UserOrg.getOrganizationUsers = function (organizationId) {
    return this.findAll({
      where: { organization_id: organizationId },
      include: [
        {
          model: sequelize.models.user,
          as: 'user',
          attributes: ['id', 'username', 'email', 'verified', 'suspended'],
        },
      ],
      order: [
        ['role', 'DESC'],
        ['joined_at', 'ASC'],
      ],
    });
  };

  return UserOrg;
};
