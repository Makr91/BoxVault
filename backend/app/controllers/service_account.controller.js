const db = require('../models');
const ServiceAccount = db.service_account;
const User = db.user;
const crypto = require('crypto');

/**
 * @swagger
 * /api/service-account:
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
    const { description, expirationDays } = req.body;
    const { userId } = req;

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
    });

    res.status(201).send(serviceAccount);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

/**
 * @swagger
 * /api/service-account:
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
    const serviceAccounts = await ServiceAccount.findAll({ where: { userId } });
    res.send(serviceAccounts);
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};

/**
 * @swagger
 * /api/service-account/{id}:
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
      res.send({ message: 'Service account deleted successfully.' });
    } else {
      res.status(404).send({ message: 'Service account not found.' });
    }
  } catch (err) {
    res.status(500).send({ message: err.message });
  }
};
