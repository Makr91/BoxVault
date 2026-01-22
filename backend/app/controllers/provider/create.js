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

// create.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import db from '../../models/index.js';
const { providers: Provider, organization: _organization, box: _box, UserOrg, versions } = db;
/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider:
 *   post:
 *     summary: Create a new provider for a version
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
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
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProviderRequest'
 *     responses:
 *       200:
 *         description: Provider created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Provider'
 *       404:
 *         description: Organization, box, or version not found
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
 *                   example: "Some error occurred while creating the Provider."
 */
export const create = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const { name, description } = req.body;
  const newFilePath = getSecureBoxPath(organization, boxId, versionNumber, name);

  try {
    const organizationData = await _organization.findOne({
      where: { name: organization },
    });

    const box = await _box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    // Check if user owns the box OR has moderator/admin role
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canCreate = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canCreate) {
      return res.status(403).send({
        message: req.__('providers.create.permissionDenied'),
      });
    }

    const version = await versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Create the provider
    const provider = await Provider.create({
      name,
      description,
      versionId: version.id,
    });

    return res.status(201).send(provider);
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('providers.create.error'),
    });
  }
};
