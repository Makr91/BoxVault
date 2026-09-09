// findone.js
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
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}:
 *   get:
 *     summary: Get a specific provider by name
 *     description: Retrieve details of a specific provider within a box version. Access depends on box visibility and user authentication; a service account is a member of its own organization only.
 *     tags: [Providers]
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
 *         description: Provider name
 *         example: virtualbox
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: JWT access token (required for private boxes)
 *     responses:
 *       200:
 *         description: Provider retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Provider'
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
 *         description: Organization, box, version, or provider not found
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
export const findOne = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
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

    const providerNotFound = () =>
      notFound(
        req,
        res,
        req.__('providers.providerNotFoundInVersion', { providerName, versionNumber, boxId })
      );

    // If the box is public, allow access
    if (box.isPublic) {
      const provider = await Provider.findOne({
        where: { name: providerName, versionId: version.id },
      });
      if (!provider) {
        return providerNotFound();
      }
      return res.send(provider);
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
    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id },
    });
    if (!provider) {
      return providerNotFound();
    }
    return res.send(provider);
  } catch (err) {
    log.error.error('Error retrieving provider:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('providers.findOne.error'),
    });
  }
};
