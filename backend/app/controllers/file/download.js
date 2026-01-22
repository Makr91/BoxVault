// download.file.controller.js
import fs from 'fs';
import { join } from 'path';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { files: File, UserOrg } = db;

// Helper to handle errors during download
const handleError = (req, res, err) => {
  if (res.headersSent) {
    log.error.error('Error in download controller after headers sent:', err);
    if (!res.writableEnded) {
      res.end();
    }
    return undefined;
  }

  // Ensure JSON content type for error and remove file headers
  res.setHeader('Content-Type', 'application/json');
  res.removeHeader('Content-Disposition');
  res.removeHeader('Content-Length');
  res.removeHeader('Content-Range');
  res.removeHeader('Accept-Ranges');

  // Use generic error message if specific one isn't appropriate
  const message = req.__('files.download.error', { error: err.message || err });

  return res.status(500).send({ message });
};

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file/download:
 *   get:
 *     summary: Download a Vagrant box file
 *     description: Download the Vagrant box file with support for range requests and authentication
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
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Download token for authentication
 *       - in: header
 *         name: Range
 *         schema:
 *           type: string
 *         description: Range header for partial content requests
 *         example: "bytes=0-1023"
 *     responses:
 *       200:
 *         description: File download (full content)
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Length:
 *             schema:
 *               type: integer
 *             description: File size in bytes
 *           Accept-Ranges:
 *             schema:
 *               type: string
 *               example: "bytes"
 *             description: Indicates server supports range requests
 *       206:
 *         description: Partial content (range request)
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *         headers:
 *           Content-Range:
 *             schema:
 *               type: string
 *               example: "bytes 0-1023/2048"
 *             description: Range of bytes being returned
 *           Content-Length:
 *             schema:
 *               type: integer
 *             description: Size of the partial content
 *       403:
 *         description: Unauthorized access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: File or organization not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       416:
 *         description: Range not satisfiable
 *         headers:
 *           Content-Range:
 *             schema:
 *               type: string
 *               example: "bytes *2048"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
const download = (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  let userId;
  let isServiceAccount;

  // Check if downloadAuth middleware successfully verified a token
  if (req.downloadTokenDecoded) {
    const decoded = req.downloadTokenDecoded;
    ({ userId, isServiceAccount } = decoded);

    if (
      decoded.organization !== organization ||
      decoded.boxId !== boxId ||
      decoded.versionNumber !== versionNumber ||
      decoded.providerName !== providerName ||
      decoded.architectureName !== architectureName
    ) {
      return res.status(403).send({ message: req.__('files.invalidDownloadToken') });
    }
  } else if (req.isVagrantRequest) {
    // For Vagrant requests, use the auth info set by vagrantHandler
    ({ userId, isServiceAccount } = req);
  } else if (req.userId) {
    // Check for session auth (x-access-token) via middleware
    ({ userId, isServiceAccount } = req);
  } else if (!req.entities?.box?.isPublic) {
    // No token provided at all.
    // If the box is NOT public, this is an error.
    return res.status(403).send({ message: req.__('files.noDownloadToken') });
  }

  log.app.info('Auth context in download:', {
    userId,
    isServiceAccount,
    isVagrantRequest: req.isVagrantRequest,
    headers: req.headers,
  });

  return (async () => {
    // Test hook for coverage
    if (req.headers['x-test-error']) {
      throw new Error('Test Error');
    }

    const baseDir = getSecureBoxPath(
      organization,
      boxId,
      versionNumber,
      providerName,
      architectureName
    );
    const filePath = join(baseDir, fileName);

    // Entities are pre-loaded by verifyBoxFilePath middleware
    const { organization: organizationData, box, architecture } = req.entities;

    // Function to handle file download and increment counter
    const sendFile = async () => {
      if (!fs.existsSync(filePath)) {
        return res.status(404).send({ message: req.__('files.notFound') });
      }

      // Find and increment download count
      const fileRecord = await File.findOne({
        where: {
          fileName: 'vagrant.box',
          architectureId: architecture.id,
        },
      });

      if (fileRecord) {
        await fileRecord.increment('downloadCount');
        log.app.info('Download count incremented:', {
          fileName: fileRecord.fileName,
          newCount: fileRecord.downloadCount + 1,
          userAgent: req.headers['user-agent'],
        });
      }

      // Set common headers
      res.setHeader('Accept-Ranges', 'bytes');

      // Use res.download for optimized streaming, range support, and headers
      res.download(filePath, fileName, err => {
        if (err) {
          handleError(req, res, err);
        }
      });
      return undefined;
    };

    // If the box is public or the requester is a service account, allow download
    if (box.isPublic || isServiceAccount) {
      await sendFile();
      return undefined;
    }

    // If the box is private, check if the user is member of the organization
    if (!userId) {
      return res.status(403).send({ message: req.__('files.download.unauthorized') });
    }

    const membership = await UserOrg.findUserOrgRole(userId, organizationData.id);
    if (!membership) {
      return res.status(403).send({ message: req.__('files.download.unauthorized') });
    }

    // User is member, allow download
    await sendFile();
    return undefined;
  })().catch(err => {
    handleError(req, res, err);
    return undefined;
  });
};

export { download };
