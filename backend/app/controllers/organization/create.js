// create.js
const db = require('../../models');

const Organization = db.organization;

/**
 * @swagger
 * /api/organization:
 *   post:
 *     summary: Create a new organization
 *     description: Create a new organization with the specified name and description
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organization
 *             properties:
 *               organization:
 *                 type: string
 *                 description: Organization name
 *               description:
 *                 type: string
 *                 description: Organization description
 *     responses:
 *       200:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Organization'
 *       400:
 *         description: Bad request - organization name cannot be empty
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Create and Save a new Organization
exports.create = async (req, res) => {
  // Validate request
  if (!req.body.organization) {
    return res.status(400).send({
      message: 'Organization cannot be empty!',
    });
  }

  // Create a Organization
  const organization = {
    name: req.body.organization,
    description: req.body.description,
    details: '',
  };

  // Save Organization in the database
  try {
    const data = await Organization.create(organization);
    return res.send(data);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while creating the Organization.',
    });
  }
};
