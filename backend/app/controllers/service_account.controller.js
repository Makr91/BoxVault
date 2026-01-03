const db = require('../models');
const ServiceAccount = db.service_account;
const User = db.user;
const crypto = require('crypto');

/**
 * @swagger
 * /api/service-accounts:
 *   post:
 *     summary: Create a new service account
 *     description: Create a service account with an authentication token for automated access
 *     tags: [Service Accounts]
 *     security:
 *       - JwtAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ServiceAccountCreateRequest'
 *     responses:
 *       201:
 *         description: Service account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServiceAccount'
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.create = async (req, res) => {
  try {
    const { description, expirationDays, organizationId } = req.body;
    const { userId } = req;

    if (!organizationId) {
      return res.status(400).send({ message: 'Organization ID is required!' });
    }

    // Verify user has moderator/admin role in the organization
    const userRole = await db.UserOrg.findUserOrgRole(userId, organizationId);
    if (!userRole || !['moderator', 'admin'].includes(userRole.role)) {
      return res.status(403).send({
        message:
          'You must be a moderator or admin in this organization to create service accounts!',
      });
    }

    const user = await User.findByPk(userId);
    const username = `${user.username}-${crypto.randomBytes(4).toString('hex')}`;
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

    const serviceAccount = await ServiceAccount.create({
      username,
      token,
      expiresAt,
      description,
      userId,
      organization_id: organizationId,
    });

    return res.status(201).send(serviceAccount);
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
};

/**
 * @swagger
 * /api/service-accounts:
 *   get:
 *     summary: Get all service accounts for the authenticated user
 *     description: Retrieve all service accounts created by the authenticated user
 *     tags: [Service Accounts]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: List of service accounts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ServiceAccount'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.findAll = async (req, res) => {
  try {
    const { userId } = req;
    const serviceAccounts = await ServiceAccount.getForUser(userId);
    return res.send(serviceAccounts);
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
};

/**
 * @swagger
 * /api/service-accounts/organizations:
 *   get:
 *     summary: Get organizations where user can create service accounts
 *     description: Retrieve all organizations where the authenticated user has moderator or admin role (required to create service accounts)
 *     tags: [Service Accounts]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: List of organizations where user can create service accounts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: Organization ID
 *                   name:
 *                     type: string
 *                     description: Organization name
 *                   description:
 *                     type: string
 *                     description: Organization description
 *                   role:
 *                     type: string
 *                     enum: [moderator, admin]
 *                     description: User's role in this organization
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.getAvailableOrganizations = async (req, res) => {
  try {
    const { userId } = req;

    const userOrganizations = await db.UserOrg.findAll({
      where: {
        user_id: userId,
        role: {
          [db.Sequelize.Op.in]: ['moderator', 'admin'],
        },
      },
      include: [
        {
          model: db.organization,
          as: 'organization',
          attributes: ['id', 'name', 'description'],
        },
      ],
    });

    const organizations = userOrganizations.map(userOrg => ({
      id: userOrg.organization.id,
      name: userOrg.organization.name,
      description: userOrg.organization.description,
      role: userOrg.role,
    }));

    return res.send(organizations);
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
};

/**
 * @swagger
 * /api/service-accounts/{id}:
 *   delete:
 *     summary: Delete a service account
 *     description: Delete a service account by ID (only the owner can delete their service accounts)
 *     tags: [Service Accounts]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Service account ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Service account deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Service account not found or not owned by user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.delete = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req;

    const deleted = await ServiceAccount.destroy({ where: { id, userId } });

    if (deleted) {
      return res.send({ message: 'Service account deleted successfully.' });
    }
    return res.status(404).send({ message: 'Service account not found.' });
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
};
