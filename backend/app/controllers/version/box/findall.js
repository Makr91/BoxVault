// findall.js
const jwt = require('jsonwebtoken');
const { loadConfig } = require('../../../utils/config-loader');
const { log } = require('../../../utils/Logger');
const db = require('../../../models');

const Version = db.versions;
const Box = db.box;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version:
 *   get:
 *     summary: Get all versions for a box
 *     tags: [Versions]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name/ID
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: JWT access token (required for private boxes)
 *     responses:
 *       200:
 *         description: List of versions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Version'
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized!"
 *       403:
 *         description: Forbidden - unauthorized access to private box
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access to versions."
 *       404:
 *         description: Organization or box not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization not found with name: example-org."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while retrieving versions."
 */
exports.findAllByBox = async (req, res) => {
  const { organization, boxId } = req.params;
  const token = req.headers['x-access-token'];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch {
      return res.status(401).send({ message: 'Unauthorized!' });
    }
  }

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res
        .status(404)
        .send({ message: `Organization not found with name: ${organization}.` });
    }

    const box = await Box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return res.status(404).send({ message: `Box not found with name: ${boxId}.` });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      const versions = await Version.findAll({ where: { boxId: box.id } });
      return res.send(versions);
    }

    // If the box is private, check if the user is member of the organization
    if (!userId) {
      return res.status(403).send({ message: 'Unauthorized access to versions.' });
    }

    const membership = await db.UserOrg.findUserOrgRole(userId, organizationData.id);
    if (!membership) {
      return res.status(403).send({ message: 'Unauthorized access to versions.' });
    }

    // User is member of organization, allow access
    const versions = await Version.findAll({ where: { boxId: box.id } });
    return res.send(versions);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while retrieving versions.',
    });
  }
};
