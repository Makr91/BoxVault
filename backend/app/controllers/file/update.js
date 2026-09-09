// update.file.controller.js
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { canWriteBox, resolveOrgMembership } from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { files: File } = db;
import { uploadFile as uploadFileMiddleware } from '../../middleware/upload.js';

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/upload:
 *   put:
 *     summary: Update a Vagrant box file
 *     description: Update an existing Vagrant box file with a new version. The box owner, or an admin or owner of the organization, may update; a service account acts inside its own organization at its effective role.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
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
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Updated Vagrant box file
 *               checksum:
 *                 type: string
 *                 description: File checksum for verification
 *               checksumType:
 *                 type: string
 *                 description: Checksum algorithm
 *                 enum: [sha256, md5, sha1, NULL]
 *               newOrganization:
 *                 type: string
 *                 description: New organization name (optional)
 *               newBoxId:
 *                 type: string
 *                 description: New box name (optional)
 *               newVersionNumber:
 *                 type: string
 *                 description: New version number (optional)
 *               newProviderName:
 *                 type: string
 *                 description: New provider name (optional)
 *               newArchitectureName:
 *                 type: string
 *                 description: New architecture name (optional)
 *     responses:
 *       200:
 *         description: File updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Updated the file successfully"
 *                 fileName:
 *                   type: string
 *                   example: "vagrant.box"
 *                 fileSize:
 *                   type: integer
 *                   description: File size in bytes
 *                 path:
 *                   type: string
 *                   description: File path on server
 *       400:
 *         description: An upload header breaks its rule
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The caller neither owns the box nor administers the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Architecture or file not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       413:
 *         description: File too large
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
const update = (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  void organization;
  void boxId;
  void versionNumber;
  void providerName;
  void architectureName;
  const fileName = `vagrant.box`;
  const uploadStartTime = Date.now();

  // Set a longer timeout for the request from config
  const appConfig = loadConfig('app');
  const uploadTimeoutHours = appConfig.boxvault?.upload_timeout_hours || 24;
  const uploadTimeoutMs = uploadTimeoutHours * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);
  res.setTimeout(uploadTimeoutMs);

  return (async () => {
    // Entities are pre-loaded by verifyBoxFilePath middleware
    const { organization: organizationData, box, architecture } = req.entities;

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, organizationData.id);
    const canUpdate = canWriteBox(req, box, membership);

    if (!canUpdate) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('files.update.permissionDenied'),
      });
    }

    const fileRecord = await File.findOne({
      where: {
        fileName,
        architectureId: architecture.id,
      },
    });

    if (!fileRecord) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('files.notFoundUploadFirst'),
      });
    }

    // Call the upload middleware directly (it handles the response and DB updates)
    await uploadFileMiddleware(req, res);
    return undefined;
  })().catch(err => {
    log.error.error('File update error:', err);
    log.app.info('Update failed after', { seconds: (Date.now() - uploadStartTime) / 1000 });

    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('files.update.error', { file: '' }),
    });
  });
};

export { update };
