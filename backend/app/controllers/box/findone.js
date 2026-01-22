// findone.js
import configLoader from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
const {
  organization: Organization,
  user: Users,
  box: Box,
  architectures: Architecture,
  versions: Version,
  providers: Provider,
  files: File,
  service_account,
  UserOrg,
} = db;

const formatVagrantResponse = (box, organization, baseUrl, requestedName, t) => {
  // Format response exactly as Vagrant expects based on box_metadata.rb
  const response = {
    // Required fields from BoxMetadata class
    name: requestedName, // Use the exact name that Vagrant requested
    description: box.description || t('boxes.defaultDescription'),
    versions: box.versions.map(version => ({
      // Version must be a valid Gem::Version (no 'v' prefix)
      version: version.versionNumber.replace(/^v/, ''),
      status: 'active',
      description_html: `<p>${t('boxes.defaultDescription')}</p>\n`,
      description_markdown: t('boxes.defaultDescription'),
      providers: version.providers.flatMap(provider =>
        provider.architectures.map(arch => {
          const [file] = arch.files;
          return {
            // Required fields from Provider class
            name: provider.name,
            url: `${baseUrl}/${organization.name}/boxes/${box.name}/versions/${version.versionNumber.replace(/^v/, '')}/providers/${provider.name}/${arch.name}/vagrant.box`,
            checksum: file?.checksum || '',
            checksum_type:
              (file?.checksumType === 'NULL' ? 'sha256' : file?.checksumType?.toLowerCase()) ||
              'sha256',
            architecture: arch.name,
            default_architecture: arch.defaultBox || true,
          };
        })
      ),
    })),
  };

  // Log the complete response for debugging
  log.app.info('Vagrant Response:', {
    requestedName,
    actualName: response.name,
    url: `${baseUrl}/${organization.name}/boxes/${box.name}`,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(response, null, 2),
  });

  return response;
};

/**
 * @swagger
 * /{organization}/{box}:
 *   get:
 *     summary: Get Vagrant box metadata
 *     description: Vagrant CLI metadata endpoint (root path, no /api prefix). Returns box metadata in Vagrant-compatible JSON format.
 *     tags: [Vagrant]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: box
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: header
 *         name: Authorization
 *         schema:
 *           type: string
 *         description: Bearer token for private boxes
 *       - in: header
 *         name: User-Agent
 *         schema:
 *           type: string
 *         description: Should start with "Vagrant/" for CLI requests
 *     responses:
 *       200:
 *         description: Vagrant metadata
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VagrantMetadata'
 *       403:
 *         description: Unauthorized access to private box
 *       404:
 *         description: Box not found
 *
 * /api/organization/{organization}/box/{name}:
 *   get:
 *     summary: Get a specific box
 *     description: Retrieve detailed information about a specific box. Supports both web API and Vagrant metadata requests.
 *     tags: [Boxes]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token for accessing private boxes
 *       - in: header
 *         name: User-Agent
 *         schema:
 *           type: string
 *         description: User agent (Vagrant requests are detected automatically)
 *     responses:
 *       200:
 *         description: Box details (format depends on request type)
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/BoxWithFullDetails'
 *                 - $ref: '#/components/schemas/VagrantMetadata'
 *       403:
 *         description: Unauthorized access to private box
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Box or organization not found
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
export const findOne = async (req, res) => {
  const { organization, name } = req.params;
  // Get auth info either from vagrantHandler or x-access-token
  let authConfig;
  let appConfig;
  try {
    authConfig = configLoader.loadConfig('auth');
    appConfig = configLoader.loadConfig('app');
  } catch (e) {
    log.error.error(`Failed to load configuration: ${e.message}`);
    return res.status(500).send({ message: 'Configuration error' });
  }

  let { userId } = req; // Set by vagrantHandler for Vagrant requests
  let { isServiceAccount } = req; // Set by vagrantHandler for Vagrant requests

  // If not set by vagrantHandler, try x-access-token
  if (!userId) {
    const token = req.headers['x-access-token'];
    if (token) {
      try {
        const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;
      } catch {
        // Don't warn about invalid tokens - user might be trying to access a public box
        userId = null;
        isServiceAccount = false;
      }
    }
  }

  log.app.info('Auth context in findOne:', {
    userId,
    isServiceAccount,
    isVagrantRequest: req.isVagrantRequest,
    headers: req.headers,
  });

  try {
    // Find the organization
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res
        .status(404)
        .send({ message: req.__('organizations.organizationNotFoundWithName', { organization }) });
    }

    // Find box by organizationId and name
    const box = await Box.findOne({
      where: { name, organizationId: organizationData.id },
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
            },
          ],
        },
      ],
    });

    if (!box) {
      return res.status(404).send({ message: req.__('boxes.boxNotFoundWithName', { name }) });
    }

    let response;
    if (req.isVagrantRequest) {
      // Format response for Vagrant metadata request
      const baseUrl = appConfig.boxvault.origin.value;
      // Always use the requested name from vagrantInfo
      // Use the requested name from vagrantInfo if available, otherwise construct it
      const requestedName = req.vagrantInfo?.requestedName || `${organization}/${name}`;
      response = formatVagrantResponse(
        box,
        organizationData,
        baseUrl,
        requestedName,
        req.__.bind(req)
      );
    } else {
      // Format response for frontend
      response = {
        ...box.toJSON(),
        organization: {
          id: organizationData.id,
          name: organizationData.name,
          emailHash: organizationData.emailHash,
        },
      };
    }

    // Set response headers for Vagrant requests
    if (req.isVagrantRequest) {
      res.set({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        Vary: 'Accept',
      });
    }

    // If box is public, allow access
    if (box.isPublic) {
      return res.json(response);
    }

    // For private boxes, require authentication
    if (!userId) {
      return res.status(403).json({ message: req.__('boxes.unauthorized') });
    }

    // Check if this box was created by a service account
    const serviceAccount = await service_account.findOne({
      where: { id: box.userId },
      include: [
        {
          model: Users,
          as: 'user',
        },
      ],
    });

    // Check if the requesting user owns any service accounts
    await service_account.findAll({
      where: { userId },
    });

    // Check if user is member of the organization
    const membership = await UserOrg.findUserOrgRole(userId, organizationData.id);
    const isMember = !!membership;

    // Allow access if:
    // 1. The user is a member of the organization
    // 2. The user is the owner of the service account that created the box
    // 3. The box was created by a service account owned by the requesting user
    // 4. The requester is a service account
    const hasAccess = isMember || serviceAccount?.user?.id === userId || isServiceAccount;

    if (hasAccess) {
      return res.json(response);
    }

    return res.status(403).json({ message: req.__('boxes.unauthorized') });
  } catch (err) {
    return res
      .status(500)
      .send({ message: req.__('boxes.findOne.error', { name, error: err.message }) });
  }
};
