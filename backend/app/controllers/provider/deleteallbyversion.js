// deleteallbyversion.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { canWriteBox, resolveOrgMembership } from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';
const { providers: Provider, organization: _organization, box: _box, versions } = db;

const notFound = (req, res, title) => problem(res, req, { status: 404, type: 'not-found', title });

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider:
 *   delete:
 *     summary: Delete all providers for a version
 *     description: Delete all providers associated with a specific box version. The box owner, or an admin or owner of the organization, may delete; a service account acts inside its own organization at its effective role.
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
 *     responses:
 *       200:
 *         description: All providers deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "All providers deleted successfully!"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The caller may not write the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization, box, version not found, or no providers found to delete
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
export const deleteAllByVersion = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;

  try {
    const organizationData = await _organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return notFound(
        req,
        res,
        req.__('organizations.organizationNotFoundWithName', { organization })
      );
    }

    const box = await _box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return notFound(req, res, req.__('boxes.boxNotFoundInOrg', { boxId, organization }));
    }

    const version = await versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return notFound(
        req,
        res,
        req.__('versions.versionNotFoundInBox', { versionNumber, boxId, organization })
      );
    }

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, organizationData.id);
    const canDelete = canWriteBox(req, box, membership);

    if (!canDelete) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('providers.delete.permissionDenied'),
      });
    }

    const deleted = await Provider.destroy({
      where: { versionId: version.id },
    });

    if (deleted) {
      return res.send({ message: req.__('providers.deletedAll') });
    }

    return notFound(req, res, req.__('providers.notFoundToDelete'));
  } catch (err) {
    log.error.error('Error deleting providers:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('providers.deleteAll.error'),
    });
  }
};
