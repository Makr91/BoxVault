// details.js
import configLoader from '../../../utils/config-loader.js';
import { log } from '../../../utils/Logger.js';
import jwt from 'jsonwebtoken';
import {
  extractBearerToken,
  findServiceAccountByRawToken,
} from '../../../utils/serviceAccountAuth.js';
import {
  canReadInOrg,
  canWriteInOrg,
  isGuestMembership,
  reachOfMembership,
  resolveOrgMembership,
} from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';
import { boxFilesWithCounts, sumBoxDownloads, treeWithinReach } from '../helpers.js';
import { snakeKeys } from '../../../utils/wire.js';
import db from '../../../models/index.js';
const {
  organization: Organization,
  user: Users,
  box: Box,
  architectures: Architecture,
  versions: Version,
  providers: Provider,
  files: File,
} = db;
const { verify } = jwt;

/**
 * @swagger
 * /api/organization/{organization}/box:
 *   get:
 *     summary: Get organization box details
 *     description: Retrieve detailed information about all boxes in an organization, including versions, providers, and architectures. Access is controlled based on authentication and box visibility; a member of the organization sees its private boxes, a guest of the organization its published private boxes flagged for guests, a service account being a member of its own organization only. Every download_count is null to a guest of the organization. Only the versions, providers, architectures and files within the caller's reach are answered on each box.
 *     tags: [Boxes]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token for accessing private boxes
 *     responses:
 *       200:
 *         description: Detailed list of boxes in the organization
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/BoxWithFullDetails'
 *       404:
 *         description: Organization not found
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
export const getOrganizationBoxDetails = async (req, res) => {
  const { organization } = req.params;
  const token = req.headers['x-access-token'];
  let userId = null;
  let membership = null;
  let isServiceAccount = false;

  let authConfig;
  try {
    authConfig = configLoader.loadConfig('auth');
  } catch (e) {
    log.error.error(`Failed to load auth configuration: ${e.message}`);
    return problem(res, req, { status: 500, type: 'internal', title: 'Configuration error' });
  }

  try {
    if (req.userId) {
      ({ userId } = req);
      isServiceAccount = Boolean(req.isServiceAccount);
      const orgData = await Organization.findOne({
        where: { name: organization },
      });

      if (orgData) {
        membership = await resolveOrgMembership(req, orgData.id);
      }
    } else if (token) {
      try {
        const decoded = verify(token, authConfig.auth.jwt.jwt_secret);
        userId = decoded.id;
        isServiceAccount = Boolean(decoded.is_service_account);
        const orgData = await Organization.findOne({
          where: { name: organization },
        });

        if (orgData) {
          membership = await resolveOrgMembership(
            { userId, isServiceAccount, serviceAccountId: decoded.service_account_id },
            orgData.id
          );
        }
      } catch {
        // Not a valid JWT — may be a raw service-account key, checked below
      }
    }

    // Raw service-account API key fallback (Authorization: Bearer or x-access-token).
    // A key from a service account belonging to this organization gets member visibility.
    if (!userId) {
      const rawToken = extractBearerToken(req) || token;
      const rawServiceAccount = await findServiceAccountByRawToken(rawToken);

      if (rawServiceAccount) {
        ({ userId } = rawServiceAccount);
        isServiceAccount = true;

        const orgData = await Organization.findOne({
          where: { name: organization },
        });

        if (orgData) {
          membership = await resolveOrgMembership(
            { userId, isServiceAccount, serviceAccountId: rawServiceAccount.id },
            orgData.id
          );
        }
      } else if (token || extractBearerToken(req)) {
        log.app.warn('Unauthorized User.');
      }
    }

    // Find organization
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFound'),
      });
    }

    // Get all boxes for this organization using organizationId
    let boxes = await Box.findAll({
      where: { organizationId: organizationData.id },
      include: [
        {
          model: Version,
          as: 'versions',
          include: [
            {
              model: Provider,
              as: 'providers',
              include: [
                {
                  model: Architecture,
                  as: 'architectures',
                  include: [
                    {
                      model: File,
                      as: 'files',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          model: Users,
          as: 'user',
          attributes: ['id', 'username', 'emailHash', 'suspended', 'createdAt', 'updatedAt'],
        },
      ],
    });

    const ownsBoxes = Boolean(userId) && (!isServiceAccount || canWriteInOrg(membership));
    const counted = !isGuestMembership(membership);
    const caller = userId ? { userId, isServiceAccount } : null;

    boxes = boxes.filter(box => {
      if (ownsBoxes && box.userId === userId) {
        return true;
      }
      if (!box.published) {
        return false;
      }
      return box.isPublic || canReadInOrg(membership, box);
    });

    // Map boxes to response format
    const formattedBoxes = boxes.map(box => {
      const versions = treeWithinReach(box, reachOfMembership(caller, box, membership));
      return {
        ...snakeKeys({
          id: box.id,
          name: box.name,
          description: box.description,
          // readme is deliberately omitted: listings don't render it and it can
          // be arbitrarily large per box.
          shortDescription: box.shortDescription,
          metadata: box.metadata,
          artwork: box.artwork,
          published: box.published,
          isPublic: box.isPublic,
          guestAccess: box.guestAccess,
          userId: box.userId,
          createdAt: box.createdAt,
          updatedAt: box.updatedAt,
          versions: versions.map(version => ({
            id: version.id,
            versionNumber: version.versionNumber,
            description: version.description,
            releaseNotes: version.releaseNotes,
            deprecated: version.deprecated,
            deprecationReason: version.deprecationReason,
            isPublic: version.isPublic,
            guestAccess: version.guestAccess,
            published: version.published,
            boxId: version.boxId,
            createdAt: version.createdAt,
            updatedAt: version.updatedAt,
            providers: version.providers.map(provider => ({
              id: provider.id,
              name: provider.name,
              description: provider.description,
              isPublic: provider.isPublic,
              guestAccess: provider.guestAccess,
              published: provider.published,
              versionId: provider.versionId,
              createdAt: provider.createdAt,
              updatedAt: provider.updatedAt,
              architectures: provider.architectures.map(architecture => ({
                id: architecture.id,
                name: architecture.name,
                defaultBox: architecture.defaultBox,
                isPublic: architecture.isPublic,
                guestAccess: architecture.guestAccess,
                published: architecture.published,
                providerId: architecture.providerId,
                createdAt: architecture.createdAt,
                updatedAt: architecture.updatedAt,
                files: boxFilesWithCounts(architecture.files, counted),
              })),
            })),
          })),
          // The box's OWN organization — never the owner's primary org, which can
          // differ and would mislabel the row.
          organization: {
            id: organizationData.id,
            name: organizationData.name,
            emailHash: organizationData.emailHash,
            logo: organizationData.logo,
          },
          user: box.user
            ? {
                id: box.user.id,
                username: box.user.username,
                emailHash: box.user.emailHash,
                suspended: box.user.suspended,
                createdAt: box.user.createdAt,
                updatedAt: box.user.updatedAt,
              }
            : null,
        }),
        download_count: counted ? sumBoxDownloads({ versions }) : null,
      };
    });

    return res.status(200).send(formattedBoxes);
  } catch (err) {
    log.error.error('Error retrieving organization box details:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('boxes.organizationDetails.error'),
    });
  }
};
