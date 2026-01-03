/**
 * Request Model
 * Handles organization join requests from users
 */
module.exports = (sequelize, Sequelize) => {
  const Request = sequelize.define(
    'Request',
    {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: 'Unique request identifier',
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
        comment: 'User requesting to join organization',
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
        comment: 'Organization being requested to join',
        field: 'organization_id',
      },
      requested_role: {
        type: Sequelize.ENUM('user', 'moderator'),
        allowNull: false,
        defaultValue: 'user',
        comment: 'Role requested by user (always defaults to user for requests)',
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'denied'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Current status of the join request',
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Optional message from user explaining why they want to join',
      },
      reviewed_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Moderator/admin who reviewed the request',
        field: 'reviewed_by',
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the request was reviewed',
        field: 'reviewed_at',
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
      tableName: 'organization_requests',
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        {
          unique: true,
          fields: ['user_id', 'organization_id', 'status'],
          name: 'unique_user_org_request',
        },
        {
          fields: ['organization_id', 'status'],
          name: 'idx_org_requests_org_status',
        },
        {
          fields: ['user_id', 'status'],
          name: 'idx_org_requests_user_status',
        },
        {
          fields: ['status'],
          name: 'idx_org_requests_status',
        },
      ],
      comment: 'Organization join requests from users',
    }
  );

  /**
   * Class methods
   */

  /**
   * Create a new join request
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @param {string} message - Optional message
   * @returns {Promise<Request>}
   */
  Request.createJoinRequest = function (userId, organizationId, message = null) {
    return this.create({
      user_id: userId,
      organization_id: organizationId,
      requested_role: 'user', // Always defaults to user for requests
      message,
      status: 'pending',
    });
  };

  /**
   * Get pending requests for organization
   * @param {number} organizationId - Organization ID
   * @returns {Promise<Request[]>}
   */
  Request.getPendingRequests = async function (organizationId) {
    const db = require('./index');
    const results = await this.findAll({
      where: { organization_id: organizationId, status: 'pending' },
      include: [
        {
          model: db.user,
          as: 'user',
          attributes: ['id', 'username', 'email'],
        },
      ],
      order: [['created_at', 'ASC']],
    });

    return results;
  };

  /**
   * Get user's pending requests
   * @param {number} userId - User ID
   * @returns {Promise<Request[]>}
   */
  Request.getUserPendingRequests = async function (userId) {
    const db = require('./index');
    const results = await this.findAll({
      where: { user_id: userId, status: 'pending' },
      order: [['created_at', 'DESC']],
    });

    // Load organizations in parallel
    await Promise.all(
      results.map(async result => {
        result.organization = await db.organization.findByPk(result.organization_id, {
          attributes: ['id', 'name', 'description'],
        });
      })
    );

    return results;
  };

  /**
   * Approve join request and add user to organization
   * @param {number} requestId - Request ID
   * @param {number} reviewerId - Moderator/admin approving
   * @param {string} assignedRole - Role to assign (user/moderator)
   * @returns {Promise<void>}
   */
  Request.approveRequest = async function (requestId, reviewerId, assignedRole = 'user') {
    const transaction = await sequelize.transaction();

    try {
      const request = await this.findByPk(requestId, { transaction });
      if (!request || request.status !== 'pending') {
        throw new Error('Request not found or already processed');
      }

      // Update request status
      await request.update(
        {
          status: 'approved',
          reviewed_by: reviewerId,
          reviewed_at: new Date(),
        },
        { transaction }
      );

      // Add user to organization
      await sequelize.models.UserOrg.create(
        {
          user_id: request.user_id,
          organization_id: request.organization_id,
          role: assignedRole,
          is_primary: false, // Never set as primary when joining additional org
        },
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  };

  /**
   * Deny join request
   * @param {number} requestId - Request ID
   * @param {number} reviewerId - Moderator/admin denying
   * @returns {Promise<void>}
   */
  Request.denyRequest = async function (requestId, reviewerId) {
    const request = await this.findByPk(requestId);
    if (!request || request.status !== 'pending') {
      throw new Error('Request not found or already processed');
    }

    await request.update({
      status: 'denied',
      reviewed_by: reviewerId,
      reviewed_at: new Date(),
    });
  };

  /**
   * Check if user has pending request for organization
   * @param {number} userId - User ID
   * @param {number} organizationId - Organization ID
   * @returns {Promise<boolean>}
   */
  Request.hasPendingRequest = async function (userId, organizationId) {
    const existing = await this.findOne({
      where: {
        user_id: userId,
        organization_id: organizationId,
        status: 'pending',
      },
    });
    return !!existing;
  };

  return Request;
};
