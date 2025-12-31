// update.js
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Version = db.versions;
const Box = db.box;

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load App configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}:
 *   put:
 *     summary: Update a specific version of a box
 *     tags: [Versions]
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
 *         description: Current version number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateVersionRequest'
 *     responses:
 *       200:
 *         description: Version updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Version'
 *       404:
 *         description: Organization, box, or version not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Box example-box not found in organization example-org."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while updating the Version."
 */
exports.update = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const { versionNumber: version, description } = req.body;
  const oldFilePath = path.join(
    appConfig.boxvault.box_storage_directory.value,
    organization,
    boxId,
    versionNumber
  );
  const newFilePath = path.join(
    appConfig.boxvault.box_storage_directory.value,
    organization,
    boxId,
    version
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
              model: Box,
              as: 'box',
              where: { name: boxId },
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

    // Extract the box from the organization data
    const box = organizationData.users.flatMap(u => u.box).find(b => b.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    const [updated] = await Version.update(
      { versionNumber: version, description },
      { where: { versionNumber, boxId: box.id } }
    );

    if (updated) {
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

      const updatedVersion = await Version.findOne({
        where: { versionNumber: version, boxId: box.id },
      });
      return res.send(updatedVersion);
    }

    throw new Error(`Version ${versionNumber} not found`);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while updating the Version.',
    });
  }
};
