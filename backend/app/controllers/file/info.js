// info.file.controller.js
import { loadConfig } from '../../utils/config-loader.js';
import { generateDownloadToken } from '../../utils/auth.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { files: File, UserOrg } = db;

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
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   description: When the file record was created
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   description: When the file record was last updated
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
  });

  try {
    const appConfig = loadConfig('app');
    const authConfig = loadConfig('auth');

    // Entities are pre-loaded by verifyBoxFilePath middleware
    const { organization: organizationData, box, architecture } = req.entities;

    // If the box is public, allow access
    if (box.isPublic) {
      const fileRecord = await File.findOne({
        where: {
          fileName: 'vagrant.box',
          architectureId: architecture.id,
        },
      });

      if (fileRecord) {
        // Generate a secure, typed download token (type:'download' + iss/aud)
        const downloadToken = generateDownloadToken(
          {
            userId,
            isServiceAccount,
            organization,
            boxId,
            versionNumber,
            providerName,
            architectureName,
          },
          authConfig.auth?.jwt?.download_link_expiry?.value || '1h'
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
          createdAt: fileRecord.createdAt,
          updatedAt: fileRecord.updatedAt,
        });
      }
      return res.status(404).send({ message: req.__('files.notFound') });
    }

    // If the box is private, check if the user is member of the organization
    if (!userId) {
      return res.status(403).send({ message: req.__('files.info.unauthorized') });
    }

    const membership = await UserOrg.findUserOrgRole(userId, organizationData.id);
    if (!membership) {
      return res.status(403).send({ message: req.__('files.info.unauthorized') });
    }

    // User is member, allow access
    const fileRecord = await File.findOne({
      where: {
        fileName: 'vagrant.box',
        architectureId: architecture.id,
      },
    });

    if (fileRecord) {
      // Generate a secure, typed download token (type:'download' + iss/aud)
      const downloadToken = generateDownloadToken(
        {
          userId,
          isServiceAccount,
          organization,
          boxId,
          versionNumber,
          providerName,
          architectureName,
        },
        authConfig.auth?.jwt?.download_link_expiry?.value || '1h'
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
        createdAt: fileRecord.createdAt,
        updatedAt: fileRecord.updatedAt,
      });
    }
    return res.status(404).send({ message: req.__('files.notFound') });
  } catch (err) {
    log.error.error('Error retrieving file info:', err);
    return res.status(500).send({
      message: req.__('files.info.error'),
    });
  }
};

export { info };
