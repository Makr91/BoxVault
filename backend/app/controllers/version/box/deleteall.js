// deleteall.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../../utils/paths');
const { log } = require('../../../utils/Logger');
const db = require('../../../models');

const Version = db.versions;
const Box = db.box;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version:
 *   delete:
 *     summary: Delete all versions for a specific box
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
 *     responses:
 *       200:
 *         description: All versions deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "All versions deleted successfully!"
 *       404:
 *         description: Organization or box not found, or no versions to delete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Box not found in organization example-org."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while deleting the versions."
 */
exports.deleteAllByBox = async (req, res) => {
  const { organization, boxId } = req.params;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`,
      });
    }

    const box = await Box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return res.status(404).send({
        message: `Box not found in organization ${organization}.`,
      });
    }

    // Check if user owns the box OR has moderator/admin role
    const membership = await db.UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canDelete = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canDelete) {
      return res.status(403).send({
        message: 'You can only delete versions of boxes you own, or you need moderator/admin role.',
      });
    }

    const deleted = await Version.destroy({
      where: { boxId: box.id },
    });

    if (deleted) {
      const boxPath = getSecureBoxPath(organization, boxId);
      fs.rm(boxPath, { recursive: true, force: true }, err => {
        if (err) {
          log.app.info(`Could not delete the box directory: ${err}`);
        }
      });

      return res.send({ message: 'All versions deleted successfully!' });
    }

    return res.status(404).send({
      message: 'No versions found to delete.',
    });
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while deleting the versions.',
    });
  }
};
