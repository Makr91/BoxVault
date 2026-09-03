// details.js
import configLoader from '../../../utils/config-loader.js';
import { log } from '../../../utils/Logger.js';
import jwt from 'jsonwebtoken';
import {
  extractBearerToken,
  findServiceAccountByRawToken,
} from '../../../utils/serviceAccountAuth.js';
import { sumBoxDownloads } from '../helpers.js';
import db from '../../../models/index.js';
const {
  organization: Organization,
  user: Users,
  box: Box,
  architectures: Architecture,
  versions: Version,
  providers: Provider,
  files: File,
  UserOrg,
} = db;
const { verify } = jwt;

/**
 * @swagger
 * /api/organization/{organization}/box:
 *   get:
 *     summary: Get organization box details
 *     description: Retrieve detailed information about all boxes in an organization, including versions, providers, and architectures. Access is controlled based on authentication and box visibility.
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
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export const getOrganizationBoxDetails = async (req, res) => {
  const { organization } = req.params;
  const token = req.headers['x-access-token'];
  let userId = null;
  let userOrganizationId = null;

  let authConfig;
  try {
    authConfig = configLoader.loadConfig('auth');
  } catch (e) {
    log.error.error(`Failed to load auth configuration: ${e.message}`);
    return res.status(500).send({ message: 'Configuration error' });
  }

  try {
    if (req.userId && !req.isServiceAccount) {
      ({ userId } = req);
      const orgData = await Organization.findOne({
        where: { name: organization },
      });

      if (orgData) {
        const membership = await UserOrg.findUserOrgRole(userId, orgData.id);
        userOrganizationId = membership ? orgData.id : null;
      }
    } else if (token) {
      try {
        const decoded = verify(token, authConfig.auth.jwt.jwt_secret.value);
        userId = decoded.id;
        const isServiceAccount = decoded.isServiceAccount || false;

        // Check if user is member of the organization
        if (!isServiceAccount) {
          const orgData = await Organization.findOne({
            where: { name: organization },
          });

          if (orgData) {
            const membership = await UserOrg.findUserOrgRole(userId, orgData.id);
            userOrganizationId = membership ? orgData.id : null;
          }
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

        const orgData = await Organization.findOne({
          where: { name: organization },
        });

        if (orgData && rawServiceAccount.organization_id === orgData.id) {
          userOrganizationId = orgData.id;
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
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
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

    // Filter boxes based on access rules
    boxes = boxes.filter(box => {
      // Allow access if:
      // 1. Box is public
      // 2. User belongs to organization
      // 3. User owns the box (service accounts impersonate their owning user)
      const hasAccess =
        box.isPublic ||
        (userId && userOrganizationId === organizationData.id) ||
        box.userId === userId;

      // Filter pending boxes - only show to owner
      if (!hasAccess) {
        return false;
      }

      // Show published boxes to everyone with access
      if (box.published) {
        return true;
      }

      // Show pending boxes only to the owner
      return box.userId === userId;
    });

    // Map boxes to response format
    const formattedBoxes = boxes.map(box => ({
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
      userId: box.userId,
      createdAt: box.createdAt,
      updatedAt: box.updatedAt,
      downloadCount: sumBoxDownloads(box),
      versions: box.versions.map(version => ({
        id: version.id,
        versionNumber: version.versionNumber,
        description: version.description,
        releaseNotes: version.releaseNotes,
        deprecated: version.deprecated,
        deprecationReason: version.deprecationReason,
        boxId: version.boxId,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        providers: version.providers.map(provider => ({
          id: provider.id,
          name: provider.name,
          description: provider.description,
          versionId: provider.versionId,
          createdAt: provider.createdAt,
          updatedAt: provider.updatedAt,
          architectures: provider.architectures.map(architecture => ({
            id: architecture.id,
            name: architecture.name,
            defaultBox: architecture.defaultBox,
            providerId: architecture.providerId,
            createdAt: architecture.createdAt,
            updatedAt: architecture.updatedAt,
            files: architecture.files.map(file => ({
              id: file.id,
              fileName: file.fileName,
              checksum: file.checksum,
              checksumType: file.checksumType,
              downloadCount: file.downloadCount,
              fileSize: file.fileSize,
              createdAt: file.createdAt,
              updatedAt: file.updatedAt,
              architectureId: file.architectureId,
            })),
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
    }));

    return res.status(200).send(formattedBoxes);
  } catch (err) {
    log.error.error('Error retrieving organization box details:', err);
    return res.status(500).send({
      message: req.__('boxes.organizationDetails.error'),
    });
  }
};
