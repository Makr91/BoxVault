// details.js
import configLoader from '../../../utils/config-loader.js';
import { log } from '../../../utils/Logger.js';
import jwt from 'jsonwebtoken';
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
  service_account,
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
  let isServiceAccount = false;

  let authConfig;
  try {
    authConfig = configLoader.loadConfig('auth');
  } catch (e) {
    log.error.error(`Failed to load auth configuration: ${e.message}`);
    return res.status(500).send({ message: 'Configuration error' });
  }

  try {
    // If a token is provided, verify it and extract the user ID
    if (token) {
      try {
        const decoded = verify(token, authConfig.auth.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;

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
          include: [
            {
              model: Organization,
              as: 'primaryOrganization',
              attributes: ['id', 'name', 'emailHash'],
            },
          ],
        },
      ],
    });

    // For each box, check if it was created by a service account
    const serviceAccountBoxes = await Promise.all(
      boxes.map(async box => {
        const serviceAccount = await service_account.findOne({
          where: { id: box.userId },
          include: [
            {
              model: Users,
              as: 'user',
            },
          ],
        });
        return { box, serviceAccount };
      })
    );

    // Filter boxes based on access rules
    boxes = boxes.filter((box, index) => {
      const { serviceAccount } = serviceAccountBoxes[index];

      // Allow access if:
      // 1. Box is public
      // 2. User belongs to organization
      // 3. User is the owner of the service account that created the box
      const hasAccess =
        box.isPublic ||
        (userId && userOrganizationId === organizationData.id) ||
        (serviceAccount && serviceAccount.user && serviceAccount.user.id === userId);

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
      published: box.published,
      isPublic: box.isPublic,
      userId: box.userId,
      createdAt: box.createdAt,
      updatedAt: box.updatedAt,
      versions: box.versions.map(version => ({
        id: version.id,
        versionNumber: version.versionNumber,
        description: version.description,
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
      user: box.user
        ? {
            id: box.user.id,
            username: box.user.username,
            email: box.user.email,
            emailHash: box.user.emailHash,
            suspended: box.user.suspended,
            createdAt: box.user.createdAt,
            updatedAt: box.user.updatedAt,
            organization: box.user.primaryOrganization
              ? {
                  id: box.user.primaryOrganization.id,
                  name: box.user.primaryOrganization.name,
                  emailHash: box.user.primaryOrganization.emailHash,
                }
              : null,
          }
        : null,
    }));

    return res.status(200).send(formattedBoxes);
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('boxes.organizationDetails.error'),
    });
  }
};
