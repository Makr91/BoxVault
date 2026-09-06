// update.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { conflict } from '../../utils/problem.js';
import db from '../../models/index.js';
const { architectures: Architecture, UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   put:
 *     summary: Update an architecture by name
 *     description: Update an architecture's properties including name and default status. Also handles file system directory renaming when architecture name changes.
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
 *         description: Current architecture name to update
 *         example: amd64
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New architecture name (the identifier pattern of /api/rules, unique in the provider)
 *                 example: arm64
 *               description:
 *                 type: string
 *                 description: Architecture description
 *               default_box:
 *                 type: boolean
 *                 description: Whether this should be the default architecture for the provider
 *                 example: true
 *     responses:
 *       200:
 *         description: Architecture updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization, box, version, provider, or architecture not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: An architecture with the new name already exists for the provider
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the architecture form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export const update = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const { name, description, default_box: defaultBox } = req.body;

  const oldFilePath = getSecureBoxPath(
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName
  );
  const newFilePath = getSecureBoxPath(
    organization,
    boxId,
    versionNumber,
    providerName,
    name || architectureName
  );

  try {
    const { organizationData, boxData: box, providerData: provider } = req;

    // Check if user owns the box OR has admin/owner role
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canUpdate = isOwner || (membership && ['admin', 'owner'].includes(membership.role));

    if (!canUpdate) {
      return res.status(403).send({
        message: req.__('architectures.update.permissionDenied'),
      });
    }

    if (name && name !== architectureName) {
      const existingArchitecture = await Architecture.findOne({
        where: { name, providerId: provider.id },
      });
      if (existingArchitecture) {
        return conflict(res, req, '/name', provider.name);
      }
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Rename the directory if necessary
    if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath)) {
      // If the target directory already exists, remove it first
      if (fs.existsSync(newFilePath)) {
        fs.rmSync(newFilePath, { recursive: true, force: true });
      }
      fs.renameSync(oldFilePath, newFilePath);

      // Clean up the old directory if it still exists after rename
      if (fs.existsSync(oldFilePath)) {
        fs.rmdirSync(oldFilePath, { recursive: true });
      }
    }

    const updatePayload = {};
    if (name) {
      updatePayload.name = name;
    }
    if (typeof description !== 'undefined') {
      updatePayload.description = description;
    }
    if (typeof defaultBox !== 'undefined') {
      updatePayload.defaultBox = defaultBox;
    }

    const [updated] = await Architecture.update(updatePayload, {
      where: { name: architectureName, providerId: provider.id },
    });

    if (updated) {
      const updatedArchitecture = await Architecture.findOne({
        where: { name: name || architectureName, providerId: provider.id },
      });
      return res.send(updatedArchitecture);
    }

    throw new Error(req.__('architectures.notFound'));
  } catch (err) {
    log.error.error('Error updating architecture:', err);
    return res.status(500).send({
      message: req.__('architectures.update.error'),
    });
  }
};
