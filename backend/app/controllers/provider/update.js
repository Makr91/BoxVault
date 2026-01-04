// update.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../utils/paths');
const db = require('../../models');

const Provider = db.providers;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}:
 *   put:
 *     summary: Update a provider by name
 *     description: Update a provider's properties including name and description. Also handles file system directory renaming when provider name changes.
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
exports.update = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name, description } = req.body;
  const oldFilePath = getSecureBoxPath(organization, boxId, versionNumber, providerName);
  const newFilePath = getSecureBoxPath(organization, boxId, versionNumber, name);

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
    });

    if (!box) {
      return res.status(404).send({
        message: req.__('boxes.boxNotFoundInOrg', { boxId, organization }),
      });
    }

    // Check if user owns the box OR has moderator/admin role
    const membership = await db.UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canUpdate = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canUpdate) {
      return res.status(403).send({
        message: req.__('providers.update.permissionDenied'),
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

    const [updated] = await Provider.update(
      { name, description },
      { where: { name: providerName, versionId: version.id } }
    );

    if (updated) {
      const updatedProvider = await Provider.findOne({
        where: { name, versionId: version.id },
      });
      return res.send(updatedProvider);
    }

    throw new Error(req.__('providers.notFound'));
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('providers.update.error'),
    });
  }
};
