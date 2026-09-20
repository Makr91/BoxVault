// upload.file.controller.js
import { join } from 'path';
import { getSecureBoxPath } from '../../utils/paths.js';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import {
  canWriteBox,
  resolveOrgMembership,
  visibilityOfQuery,
  widerThanParent,
} from '../../utils/orgMembership.js';
import { problem, refuse } from '../../utils/problem.js';
import { uploadFile as uploadFileMiddleware } from '../../middleware/upload.js';

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/upload:
 *   post:
 *     summary: Upload a Vagrant box file
 *     description: Upload a new Vagrant box file for a specific architecture and provider. The box owner, or an admin or owner of the organization, may upload; a service account acts inside its own organization at its effective role. A file row the upload creates is born private, closed to guests and unpublished unless the query members is_public, guest_access and published say otherwise, never wider than its architecture, a wider word answered 422 before any byte is read; a replaced row keeps its words.
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
 *       - in: query
 *         name: is_public
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: guest_access
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: published
 *         schema:
 *           type: boolean
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
 *         description: Provider name (e.g., virtualbox, vmware)
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name (e.g., amd64, arm64)
 *       - in: header
 *         name: x-checksum
 *         schema:
 *           type: string
 *         description: Declared checksum of the whole file, verified after assembly
 *       - in: header
 *         name: x-checksum-type
 *         schema:
 *           type: string
 *           enum: [NULL, MD5, SHA1, SHA256, SHA384, SHA512]
 *       - in: header
 *         name: x-chunk-index
 *         schema:
 *           type: integer
 *       - in: header
 *         name: x-total-chunks
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/octet-stream:
 *           schema:
 *             type: string
 *             format: binary
 *             description: The box bytes, whole or one chunk of a chunked upload
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "File uploaded successfully"
 *                 details:
 *                   type: object
 *                   properties:
 *                     is_complete:
 *                       type: boolean
 *                     status:
 *                       type: string
 *                       enum: [complete, uploading]
 *                     file_size:
 *                       type: integer
 *                       description: File size in bytes (single upload or completed chunked upload)
 *                     chunks_received:
 *                       type: integer
 *                       description: Chunks received so far (chunked upload in progress)
 *                     total_chunks:
 *                       type: integer
 *                     current_chunk:
 *                       type: integer
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
 *         description: Architecture not found
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
const upload = (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const baseDir = getSecureBoxPath(
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName
  );
  const filePath = join(baseDir, fileName);
  const uploadStartTime = Date.now();

  log.app.info('=== FILE UPLOAD STARTED ===', {
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName,
    fileName,
    filePath,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length'],
      'x-access-token': req.headers['x-access-token'] ? 'present' : 'missing',
      'x-checksum': req.headers['x-checksum'] || 'missing',
      'x-checksum-type': req.headers['x-checksum-type'] || 'missing',
      'x-file-name': req.headers['x-file-name'] || 'missing',
    },
    method: req.method,
    url: req.url,
  });

  // Set a longer timeout for the request from config
  const appConfig = loadConfig('app');
  const uploadTimeoutHours = appConfig.boxvault?.upload_timeout_hours || 24;
  const uploadTimeoutMs = uploadTimeoutHours * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);
  res.setTimeout(uploadTimeoutMs);

  return (async () => {
    // The verifyBoxFilePath middleware has already validated the path and attached entities.
    const { box: boxData, architecture: architectureData } = req.entities;

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, boxData.organizationId);
    const canUpload = canWriteBox(req, boxData, membership);

    if (!canUpload) {
      log.app.error('Permission denied for upload', {
        userId: req.userId,
        boxOwnerId: boxData.userId,
      });
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('files.upload.permissionDenied'),
      });
    }

    const visibility = {
      isPublic: false,
      guestAccess: false,
      published: false,
      ...visibilityOfQuery(req.query),
    };
    const wider = widerThanParent(visibility, architectureData);
    if (wider) {
      return refuse(res, req, [wider]);
    }
    req.fileVisibility = visibility;

    log.app.info('Architecture found, calling upload middleware...', {
      architectureId: architectureData.id,
      architectureName: architectureData.name,
    });

    // Call the upload middleware directly (it handles the response)
    await uploadFileMiddleware(req, res);
    return undefined;
  })().catch(err => {
    // Log detailed error information
    log.error.error('File upload error:', {
      error: err.message,
      code: err.code,
      stack: err.stack,
      params: {
        organization,
        boxId,
        versionNumber,
        providerName,
        architectureName,
      },
    });

    log.app.info('Upload failed after', { seconds: (Date.now() - uploadStartTime) / 1000 });

    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('files.upload.error'),
    });
  });
};

export { upload };
