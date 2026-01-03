/**
 * @swagger
 * components:
 *   schemas:
 *     Provider:
 *       type: object
 *       required:
 *         - name
 *         - versionId
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the provider
 *         name:
 *           type: string
 *           description: The provider name (e.g., virtualbox, vmware)
 *         description:
 *           type: string
 *           description: Description of the provider
 *         versionId:
 *           type: integer
 *           description: ID of the version this provider belongs to
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Provider creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Provider last update timestamp
 *       example:
 *         id: 1
 *         name: "virtualbox"
 *         description: "VirtualBox provider"
 *         versionId: 1
 *         createdAt: "2023-01-01T00:00:00.000Z"
 *         updatedAt: "2023-01-01T00:00:00.000Z"
 *
 *     CreateProviderRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: The provider name
 *         description:
 *           type: string
 *           description: Description of the provider
 *       example:
 *         name: "virtualbox"
 *         description: "VirtualBox provider"
 *
 *     UpdateProviderRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: The new provider name
 *         description:
 *           type: string
 *           description: Updated description of the provider
 *       example:
 *         name: "virtualbox"
 *         description: "Updated VirtualBox provider"
 */

// findone.js
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const jwt = require('jsonwebtoken');
const db = require('../../models');

const Provider = db.providers;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}:
 *   get:
 *     summary: Get a specific provider by name
 *     description: Retrieve details of a specific provider within a box version. Access depends on box visibility and user authentication.
 *     tags: [Providers]
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
 *         description: Box name/ID
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
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: JWT access token (required for private boxes)
 *     responses:
 *       200:
 *         description: Provider retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Provider'
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
 *                   example: "Unauthorized access to provider."
 *       404:
 *         description: Organization, box, version, or provider not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Provider virtualbox not found for version 1.0.0 in box ubuntu-server in organization myorg."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while retrieving the Provider."
 */
exports.findOne = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
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
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', { organization }),
      });
    }

    const box = await db.box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
      attributes: ['id', 'name', 'isPublic'],
    });

    if (!box) {
      return res.status(404).send({
        message: req.__('boxes.boxNotFoundInOrg', { boxId, organization }),
      });
    }

    const version = await db.versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return res.status(404).send({
        message: req.__('versions.versionNotFoundInBox', { versionNumber, boxId, organization }),
      });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      const provider = await Provider.findOne({
        where: { name: providerName, versionId: version.id },
      });
      if (!provider) {
        return res.status(404).send({
          message: req.__('providers.providerNotFoundInVersion', {
            providerName,
            versionNumber,
            boxId,
          }),
        });
      }
      return res.send(provider);
    }

    // If the box is private, check if the user is member of the organization
    if (!userId) {
      return res.status(403).send({ message: req.__('providers.unauthorized') });
    }

    const membership = await db.UserOrg.findUserOrgRole(userId, organizationData.id);
    if (!membership) {
      return res.status(403).send({ message: req.__('providers.unauthorized') });
    }

    // User is member, allow access
    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id },
    });
    if (!provider) {
      return res.status(404).send({
        message: req.__('providers.providerNotFoundInVersion', {
          providerName,
          versionNumber,
          boxId,
        }),
      });
    }
    return res.send(provider);
  } catch (err) {
    return res.status(500).send({ message: err.message || req.__('providers.findOne.error') });
  }
};
