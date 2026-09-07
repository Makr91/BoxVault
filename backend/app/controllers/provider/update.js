// update.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { conflict } from '../../utils/problem.js';
import db from '../../models/index.js';
import { canWriteBox, resolveOrgMembership } from '../../utils/orgMembership.js';
const { providers: Provider } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}:
 *   put:
 *     summary: Update a provider by name
 *     description: Update a provider's properties including name and description. Also handles file system directory renaming when provider name changes. The box owner, or an admin or owner of the organization, may update; a service account acts inside its own organization at its effective role.
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
 *         description: Current provider name to update
 *         example: virtualbox
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProviderRequest'
 *     responses:
 *       200:
 *         description: Provider updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Provider'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized!"
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
 *       409:
 *         description: A provider with the new name already exists for the version
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the provider form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while updating the Provider."
 */
export const update = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name, description } = req.body;
  const oldFilePath = getSecureBoxPath(organization, boxId, versionNumber, providerName);
  const newFilePath = getSecureBoxPath(organization, boxId, versionNumber, name || providerName);

  try {
    const { organizationData, boxData: box, versionData: version } = req;

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, organizationData.id);
    const canUpdate = canWriteBox(req, box, membership);

    if (!canUpdate) {
      return res.status(403).send({
        message: req.__('providers.update.permissionDenied'),
      });
    }

    if (name && name !== providerName) {
      const existingProvider = await Provider.findOne({
        where: { name, versionId: version.id },
      });
      if (existingProvider) {
        return conflict(res, req, '/name', version.versionNumber);
      }
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Rename the directory if necessary
    if (oldFilePath !== newFilePath) {
      fs.renameSync(oldFilePath, newFilePath);

      // Clean up the old directory if it still exists
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

    const [updated] = await Provider.update(updatePayload, {
      where: { name: providerName, versionId: version.id },
    });

    if (updated) {
      const updatedProvider = await Provider.findOne({
        where: { name: name || providerName, versionId: version.id },
      });
      return res.send(updatedProvider);
    }

    return res.status(404).send({
      message: req.__('providers.notFound'),
    });
  } catch (err) {
    log.error.error('Error updating provider:', err);
    return res.status(500).send({
      message: req.__('providers.update.error'),
    });
  }
};
