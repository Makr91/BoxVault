// delete.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../utils/paths');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Version = db.versions;

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}:
 *   delete:
 *     summary: Delete a specific version of a box
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
 *         description: Version number to delete
 *     responses:
 *       200:
 *         description: Version deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Version deleted successfully!"
 *       404:
 *         description: Organization, box, or version not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Version 1.0.0 not found for box example-box in organization example-org."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while deleting the Version."
 */
exports.delete = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;

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
    const box = organizationData.members.flatMap(u => u.box).find(b => b.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: req.__('boxes.boxNotFound'),
      });
    }

    const version = box.versions.find(v => v.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: req.__('versions.versionNotFound'),
      });
    }

    const deleted = await Version.destroy({
      where: { id: version.id },
    });

    if (deleted) {
      const versionPath = getSecureBoxPath(organization, boxId, versionNumber);
      fs.rm(versionPath, { recursive: true, force: true }, err => {
        if (err) {
          log.app.info(`Could not delete the version directory: ${err}`);
        }
      });

      return res.send({ message: req.__('versions.versionDeleted') });
    }

    return res.status(404).send({
      message: req.__('versions.versionNotFound'),
    });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('errors.operationFailed'),
    });
  }
};
