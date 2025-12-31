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

// update.js
const fs = require('fs');
const path = require('path');

const { loadConfig } = require('../../utils/config-loader');
const db = require('../../models');

const Provider = db.providers;

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  const { log } = require('../../utils/Logger');
  log.error.error(`Failed to load App configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}/providers/{providerName}:
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
  const oldFilePath = path.join(
    appConfig.boxvault.box_storage_directory.value,
    organization,
    boxId,
    versionNumber,
    providerName
  );
  const newFilePath = path.join(
    appConfig.boxvault.box_storage_directory.value,
    organization,
    boxId,
    versionNumber,
    name
  );

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [
        {
          model: db.user,
          as: 'users',
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
        message: `Organization not found with name: ${organization}.`,
      });
    }

    // Extract the box and version from the organization data
    const box = organizationData.users
      .flatMap(user => user.box)
      .find(foundBox => foundBox.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    const version = box.versions.find(foundVersion => foundVersion.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`,
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

    throw new Error('Provider not found');
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while updating the Provider.',
    });
  }
};
