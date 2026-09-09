// deleteall.js
import fs from 'fs';
import { getSecureBoxPath } from '../../../utils/paths.js';
import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';
import { canWriteBox, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';

const { versions: Version } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version:
 *   delete:
 *     summary: Delete all versions for a specific box
 *     description: The box owner, or an admin or owner of the organization, may delete the versions; a service account acts inside its own organization at its effective role.
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
 *       403:
 *         description: The caller may not write the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization or box not found, or no versions to delete
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const deleteAllByBox = async (req, res) => {
  const { organization, boxId } = req.params;

  try {
    // Organization and Box are already verified and attached by verifyVersion middleware
    const { organizationData, boxData: box } = req;

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, organizationData.id);
    const canDelete = canWriteBox(req, box, membership);

    if (!canDelete) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('versions.delete.permissionDenied'),
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

    return problem(res, req, {
      status: 404,
      type: 'not-found',
      title: req.__('versions.notFoundToDelete'),
    });
  } catch (err) {
    log.error.error('Error deleting versions:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('versions.deleteAll.error'),
    });
  }
};
