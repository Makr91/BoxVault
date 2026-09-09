// findallbyversion.js
import { log } from '../../utils/Logger.js';
import { resolveOrgMembership } from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { providers: Provider, organization: _organization, box: _box, versions } = db;

const notFound = (req, res, title) => problem(res, req, { status: 404, type: 'not-found', title });

const unauthorized = (req, res) =>
  problem(res, req, { status: 403, type: 'forbidden', title: req.__('providers.unauthorized') });

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider:
 *   get:
 *     summary: Get all providers for a version
 *     description: A private box needs membership of its organization; a service account is a member of its own organization only.
 *     tags: [Providers]
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
 *         description: Version number
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: JWT access token (required for private boxes)
 *     responses:
 *       200:
 *         description: List of providers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Provider'
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: Forbidden - unauthorized access to private box
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
export const findAllByVersion = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const { userId } = req;

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
      attributes: ['id', 'name', 'isPublic'],
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

    // If the box is public, allow access
    if (box.isPublic) {
      const providers = await Provider.findAll({ where: { versionId: version.id } });
      return res.send(providers);
    }

    // If the box is private, check if the user is member of the organization
    if (!userId) {
      return unauthorized(req, res);
    }

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!membership) {
      return unauthorized(req, res);
    }

    // User is member, allow access
    const providers = await Provider.findAll({ where: { versionId: version.id } });
    return res.send(providers);
  } catch (err) {
    log.error.error('Error retrieving providers:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('providers.findAll.error'),
    });
  }
};
