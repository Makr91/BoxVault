// findone.js
const jwt = require('jsonwebtoken');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Architecture = db.architectures;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   get:
 *     summary: Get a specific architecture
 *     description: Retrieve details of a specific architecture. Requires authentication and appropriate access permissions.
 *     tags: [Architectures]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: myorg
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *         example: ubuntu-server
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *         example: "1.0.0"
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *         example: virtualbox
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *         example: amd64
 *       - in: header
 *         name: x-access-token
 *         required: true
 *         schema:
 *           type: string
 *         description: JWT authentication token
 *     responses:
 *       200:
 *         description: Architecture retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: No token provided or unauthorized access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Box, version, provider, or architecture not found
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
exports.findOne = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const token = req.headers['x-access-token'];

  if (!token) {
    return res.status(403).send({ message: 'No token provided!' });
  }

  try {
    const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
    req.userId = decoded.id;
    req.isServiceAccount = decoded.isServiceAccount;
  } catch {
    return res.status(401).send({ message: 'Unauthorized!' });
  }

  try {
    // Find the box and its public status
    const box = await db.box.findOne({
      where: { name: boxId },
      attributes: ['id', 'name', 'isPublic'],
      include: [
        {
          model: db.versions,
          as: 'versions',
          where: { versionNumber },
          include: [
            {
              model: db.providers,
              as: 'providers',
              where: { name: providerName },
            },
          ],
        },
      ],
    });

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found.`,
      });
    }

    const version = box.versions.find(v => v.versionNumber === versionNumber);
    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId}.`,
      });
    }

    const provider = version.providers.find(p => p.name === providerName);
    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`,
      });
    }

    // If the box is public or it's a service account, allow access
    if (box.isPublic || req.isServiceAccount) {
      const architecture = await Architecture.findOne({
        where: { name: architectureName, providerId: provider.id },
        attributes: ['name'], // Specify limited fields
      });
      return res.send(architecture);
    }

    // If the box is private and it's not a service account, check if the user belongs to the organization
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [
        {
          model: db.user,
          as: 'users',
          where: { id: req.userId },
        },
      ],
    });

    if (!organizationData) {
      return res.status(403).send({ message: 'Unauthorized access to architecture.' });
    }

    // If the user belongs to the organization, allow access
    const architecture = await Architecture.findOne({
      where: { name: architectureName, providerId: provider.id },
    });
    return res.send(architecture);
  } catch (err) {
    return res
      .status(500)
      .send({ message: err.message || 'Some error occurred while retrieving the Architecture.' });
  }
};
