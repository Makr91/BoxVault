// findall.js
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const jwt = require('jsonwebtoken');
const db = require('../../models');

const Organization = db.organization;
const { Op } = db.Sequelize;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/organization:
 *   get:
 *     summary: Get all organizations
 *     description: Retrieve all organizations with optional name filtering and box counts
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organization
 *         schema:
 *           type: string
 *         description: Filter organizations by name (partial match)
 *     responses:
 *       200:
 *         description: List of organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Organization'
 *                   - type: object
 *                     properties:
 *                       totalBoxes:
 *                         type: integer
 *                         description: Total number of boxes accessible to the requesting user
 *       401:
 *         description: Unauthorized - invalid token
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
// Retrieve all Organizations from the database.
exports.findAll = async (req, res) => {
  const { organization } = req.query;
  const token = req.headers['x-access-token'];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch {
      return res.status(401).send({ message: req.__('auth.unauthorized') });
    }
  }

  try {
    const condition = organization ? { name: { [Op.like]: `%${organization}%` } } : null;
    const organizations = await Organization.findAll({ where: condition });

    const result = organizations.map(org => ({
      ...org.toJSON(),
      totalBoxes: org.members.reduce(
        (acc, user) =>
          acc + user.box.filter(box => box.isPublic || (userId && user.id === userId)).length,
        0
      ),
    }));

    return res.status(200).send(result);
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('organizations.findAllError'),
    });
  }
};
