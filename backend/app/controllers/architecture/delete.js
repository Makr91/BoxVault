// delete.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { canWriteBox, resolveOrgMembership } from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';
const { architectures: Architecture, providers: Provider } = db;

const notFound = (req, res, title) => problem(res, req, { status: 404, type: 'not-found', title });

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   delete:
 *     summary: Delete a specific architecture
 *     description: Delete a specific architecture and its associated files from the system. The box owner, or an admin or owner of the organization, may delete; a service account acts inside its own organization at its effective role.
 *     tags: [Architectures]
 *     security:
 *       - JwtAuth: []
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
 *         description: Box name
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
 *         description: Provider name
 *         example: virtualbox
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name to delete
 *         example: amd64
 *     responses:
 *       200:
 *         description: Architecture deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization, box, version, provider, or architecture not found
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
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return notFound(
        req,
        res,
        req.__('organizations.organizationNotFoundWithName', { organization })
      );
    }

    const box = await db.box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
    });

    if (!box) {
      return notFound(req, res, req.__('boxes.boxNotFoundInOrg', { boxId, organization }));
    }

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, organizationData.id);
    const canDelete = canWriteBox(req, box, membership);

    if (!canDelete) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('architectures.delete.permissionDenied'),
      });
    }

    const version = await db.versions.findOne({
      where: { versionNumber, boxId: box.id },
    });

    if (!version) {
      return notFound(
        req,
        res,
        req.__('versions.versionNotFoundInBox', { versionNumber, boxId, organization })
      );
    }

    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id },
    });

    if (!provider) {
      return notFound(
        req,
        res,
        req.__('providers.providerNotFoundInVersion', { providerName, versionNumber, boxId })
      );
    }

    const deleted = await Architecture.destroy({
      where: { name: architectureName, providerId: provider.id },
    });

    if (deleted) {
      return res.send({ message: req.__('architectures.deleted') });
    }

    return notFound(req, res, req.__('architectures.notFound'));
  } catch (err) {
    log.error.error('Error deleting architecture:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('architectures.delete.error'),
    });
  }
};

export { _delete as delete };
