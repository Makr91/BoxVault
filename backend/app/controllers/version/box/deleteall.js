// deleteall.js
import fs from 'fs';
import { getSecureBoxPath } from '../../../utils/paths.js';
import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';

const { versions: Version, UserOrg } = db;

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
export const deleteAllByBox = async (req, res) => {
  const { organization, boxId } = req.params;

  try {
    // Organization and Box are already verified and attached by verifyVersion middleware
    const { organizationData, boxData: box } = req;

    // Check if user owns the box OR has moderator/admin role
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canDelete = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canDelete) {
      return res.status(403).send({
        message: req.__('versions.delete.permissionDenied'),
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

      return res.send({ message: req.__('versions.deletedAll') });
    }

    return res.status(404).send({
      message: req.__('versions.notFoundToDelete'),
    });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('versions.deleteAll.error'),
    });
  }
};
