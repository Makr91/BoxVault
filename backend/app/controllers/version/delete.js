// delete.js

import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';

import { log } from '../../utils/Logger.js';

import db from '../../models/index.js';
import { canWriteBox, resolveOrgMembership } from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';

const { versions: Version } = db;

const versionNotFound = (req, res) =>
  problem(res, req, { status: 404, type: 'not-found', title: req.__('versions.versionNotFound') });

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}:
 *   delete:
 *     summary: Delete a specific version of a box
 *     description: The box owner, or an admin or owner of the organization, may delete a version; a service account acts inside its own organization at its effective role.
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
 *       403:
 *         description: The caller may not write the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization, box, or version not found
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
const _delete = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;

  try {
    // Organization and Box are already verified and attached by verifyVersion middleware
    const { organizationData, boxData: box } = req;

    const version = await Version.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return versionNotFound(req, res);
    }

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

    return versionNotFound(req, res);
  } catch (err) {
    log.error.error('Error deleting version:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { _delete as delete };
