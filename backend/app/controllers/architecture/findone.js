// findone.js
import { log } from '../../utils/Logger.js';
import { resolveOrgMembership } from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const {
  architectures: Architecture,
  organization: _organization,
  box: _box,
  versions,
  providers,
} = db;

const notFound = (req, res, title) => problem(res, req, { status: 404, type: 'not-found', title });

const unauthorized = (req, res) =>
  problem(res, req, {
    status: 403,
    type: 'forbidden',
    title: req.__('architectures.unauthorized'),
  });

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   get:
 *     summary: Get a specific architecture
 *     description: Retrieve details of a specific architecture. A private box needs membership of its organization; a service account is a member of its own organization only, at its effective role.
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
 *         description: Architecture name
 *         example: amd64
 *       - in: header
 *         name: x-access-token
 *         required: true
 *         schema:
 *           type: string
 *         description: JWT authentication token
 *     responses:
 *       200:
 *         description: Architecture retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: No token provided or unauthorized access
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Box, version, provider, or architecture not found
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
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  // req.userId and req.isServiceAccount are set by sessionAuth middleware or vagrantHandler

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

    // Find the box by organizationId
    const box = await _box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
      attributes: ['id', 'name', 'isPublic'],
      include: [
        {
          model: versions,
          as: 'versions',
          where: { versionNumber },
          include: [
            {
              model: providers,
              as: 'providers',
              where: { name: providerName },
            },
          ],
        },
      ],
    });

    if (!box) {
      return notFound(req, res, req.__('boxes.boxNotFound', { boxId }));
    }

    const version = box.versions.find(v => v.versionNumber === versionNumber);
    if (!version) {
      return notFound(req, res, req.__('versions.versionNotFoundForBox', { versionNumber, boxId }));
    }

    const provider = version.providers.find(p => p.name === providerName);
    if (!provider) {
      return notFound(
        req,
        res,
        req.__('providers.providerNotFoundInVersion', { providerName, versionNumber, boxId })
      );
    }

    // If the box is public, allow access
    if (box.isPublic) {
      const architecture = await Architecture.findOne({
        where: { name: architectureName, providerId: provider.id },
      });
      if (!architecture) {
        return notFound(req, res, req.__('architectures.notFound'));
      }
      return res.send(architecture);
    }

    // If the box is private, check if the user is member of the organization
    if (!req.userId) {
      return unauthorized(req, res);
    }
    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!membership) {
      return unauthorized(req, res);
    }

    // If the user belongs to the organization, allow access
    const architecture = await Architecture.findOne({
      where: { name: architectureName, providerId: provider.id },
    });
    if (!architecture) {
      return notFound(req, res, req.__('architectures.notFound'));
    }
    return res.send(architecture);
  } catch (err) {
    log.error.error('Error retrieving architecture:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('architectures.findOne.error'),
    });
  }
};
