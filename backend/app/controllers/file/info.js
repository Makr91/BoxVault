// info.file.controller.js
const jwt = require('jsonwebtoken');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const db = require('../../models');

let appConfig;
let authConfig;
try {
  appConfig = loadConfig('app');
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load configuration: ${e.message}`);
}

const File = db.files;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/info:
 *   get:
 *     summary: Get file information
 *     description: Retrieve information about a Vagrant box file including download URL and metadata
 *     tags: [Files]
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
 *         description: Box name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token for accessing private files
 *     responses:
 *       200:
 *         description: File information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileName:
 *                   type: string
 *                   example: "vagrant.box"
 *                   description: Name of the file
 *                 downloadUrl:
 *                   type: string
 *                   example: "https://api.example.com/organization/myorg/box/mybox/version/1.0.0/provider/virtualbox/architecture/amd64/file/download?token=..."
 *                   description: Secure download URL with token
 *                 downloadCount:
 *                   type: integer
 *                   example: 42
 *                   description: Number of times the file has been downloaded
 *                 checksum:
 *                   type: string
 *                   example: "a1b2c3d4e5f6..."
 *                   description: File checksum
 *                 checksumType:
 *                   type: string
 *                   example: "sha256"
 *                   description: Checksum algorithm used
 *                 fileSize:
 *                   type: integer
 *                   example: 1073741824
 *                   description: File size in bytes
 *       403:
 *         description: Unauthorized access to file information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: File, box, or organization not found
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
const info = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

  const { userId, isServiceAccount } = req;
  // req.userId and req.isServiceAccount are set by sessionAuth middleware or vagrantHandler

  log.app.info('Auth context in info:', {
    userId,
    isServiceAccount,
    isVagrantRequest: req.isVagrantRequest,
    headers: req.headers,
  });

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
    });

    if (!organizationData) {
      return res.status(404).send({
        message: req.__('organizations.organizationNotFoundWithName', { organization }),
      });
    }

    const box = await db.box.findOne({
      where: { name: boxId, organizationId: organizationData.id },
      attributes: ['id', 'name', 'isPublic'],
      include: [
        {
          model: db.versions,
          as: 'versions',
          where: { versionNumber },
          include: [
            {
              model: db.providers,
              as: 'providers',
              where: { name: providerName },
              include: [
                {
                  model: db.architectures,
                  as: 'architectures',
                  where: { name: architectureName },
                },
              ],
            },
          ],
        },
      ],
    });

    if (!box) {
      return res.status(404).send({
        message: req.__('boxes.boxNotFoundInOrg', { boxId, organization }),
      });
    }

    // If the box is public or the requester is a service account, allow access
    if (box.isPublic || isServiceAccount) {
      const fileRecord = await File.findOne({
        where: {
          fileName: 'vagrant.box',
          architectureId: box.versions[0].providers[0].architectures[0].id,
        },
      });

      if (fileRecord) {
        // Generate a secure download token
        const downloadToken = jwt.sign(
          {
            userId,
            isServiceAccount,
            organization,
            boxId,
            versionNumber,
            providerName,
            architectureName,
          },
          authConfig.auth.jwt.jwt_secret.value,
          { expiresIn: '1h' }
        );

        // Create secure download URL
        const downloadUrl = `${appConfig.boxvault.api_url.value}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download?token=${downloadToken}`;

        return res.send({
          fileName: fileRecord.fileName,
          downloadUrl,
          downloadCount: fileRecord.downloadCount,
          checksum: fileRecord.checksum,
          checksumType: fileRecord.checksumType,
          fileSize: fileRecord.fileSize,
        });
      }
      return res.status(404).send({ message: req.__('files.notFound') });
    }

    // If the box is private, check if the user is member of the organization
    if (!userId) {
      return res.status(403).send({ message: req.__('files.info.unauthorized') });
    }

    const membership = await db.UserOrg.findUserOrgRole(userId, organizationData.id);
    if (!membership) {
      return res.status(403).send({ message: req.__('files.info.unauthorized') });
    }

    // User is member, allow access
    const fileRecord = await File.findOne({
      where: {
        fileName: 'vagrant.box',
        architectureId: box.versions[0].providers[0].architectures[0].id,
      },
    });

    if (fileRecord) {
      // Generate a secure download token
      const downloadToken = jwt.sign(
        {
          userId,
          isServiceAccount,
          organization,
          boxId,
          versionNumber,
          providerName,
          architectureName,
        },
        authConfig.auth.jwt.jwt_secret.value,
        { expiresIn: '1h' }
      );

      // Create secure download URL
      const downloadUrl = `${appConfig.boxvault.api_url.value}/organization/${organization}/box/${boxId}/version/${versionNumber}/provider/${providerName}/architecture/${architectureName}/file/download?token=${downloadToken}`;

      return res.send({
        fileName: fileRecord.fileName,
        downloadUrl,
        downloadCount: fileRecord.downloadCount,
        checksum: fileRecord.checksum,
        checksumType: fileRecord.checksumType,
        fileSize: fileRecord.fileSize,
      });
    }
    return res.status(404).send({ message: req.__('files.notFound') });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('files.info.error'),
    });
  }
};

module.exports = { info };
