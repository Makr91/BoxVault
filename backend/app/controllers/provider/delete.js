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

// delete.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../utils/paths');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Provider = db.providers;
const Architecture = db.architectures;

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}/providers/{providerName}:
 *   delete:
 *     summary: Delete a specific provider
 *     description: Delete a specific provider and all its associated architectures and files from the system
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
 *         description: Provider name to delete
 *         example: virtualbox
 *     responses:
 *       200:
 *         description: Provider and associated architectures deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Provider and associated architectures deleted successfully!"
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
 *                   example: "Provider not found."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while deleting the Provider."
 */
exports.delete = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [
        {
          model: db.user,
          as: 'members',
          include: [
            {
              model: db.box,
              as: 'box',
              where: { name: boxId },
              include: [
                {
                  model: db.versions,
                  as: 'versions',
                  where: { versionNumber },
                },
              ],
            },
          ],
        },
      ],
    });

    if (!organizationData) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFound'),
      });
    }

    // Extract the box and version from the organization data
    const box = organizationData.members
      .flatMap(user => user.box)
      .find(foundBox => foundBox.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: req.__('boxes.boxNotFound'),
      });
    }

    const version = box.versions.find(foundVersion => foundVersion.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: req.__('versions.versionNotFound'),
      });
    }

    // Find the provider to delete
    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id },
    });

    if (!provider) {
      return res.status(404).send({
        message: req.__('providers.providerNotFound'),
      });
    }

    // Find all architectures associated with the provider
    const architectures = await Architecture.findAll({
      where: { providerId: provider.id },
    });

    // Delete all files and directories associated with each architecture
    const deletePromises = architectures.map(architecture => {
      const filePath = getSecureBoxPath(
        organization,
        boxId,
        versionNumber,
        providerName,
        architecture.name
      );

      // Delete files from the file system
      fs.rm(filePath, { recursive: true, force: true }, err => {
        if (err) {
          log.app.info(`Could not delete the architecture directory: ${err}`);
        }
      });

      // Delete architecture from the database
      return architecture.destroy();
    });

    await Promise.all(deletePromises);

    // Delete the provider from the database using the provider object
    await provider.destroy();

    // Delete the provider's directory
    const providerPath = getSecureBoxPath(organization, boxId, versionNumber, providerName);
    fs.rm(providerPath, { recursive: true, force: true }, err => {
      if (err) {
        log.app.info(`Could not delete the provider directory: ${err}`);
      }
    });

    return res.send({ message: req.__('providers.providerDeleted') });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('errors.operationFailed'),
    });
  }
};
