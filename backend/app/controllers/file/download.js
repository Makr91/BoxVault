// download.file.controller.js
const fs = require('fs');
const path = require('path');
const { getSecureBoxPath } = require('../../utils/paths');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const File = db.files;

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
const download = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const fileName = `vagrant.box`;
  const baseDir = getSecureBoxPath(
    organization,
    boxId,
    versionNumber,
    providerName,
    architectureName
  );
  const filePath = path.join(baseDir, fileName);
  // Get auth info from download token
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
      return res.status(403).send({ message: 'Invalid download token.' });
    }
  } else if (req.isVagrantRequest) {
    // For Vagrant requests, use the auth info set by vagrantHandler
    ({ userId, isServiceAccount } = req);
  } else if (req.userId) {
    // Check for session auth (x-access-token) via middleware
    ({ userId, isServiceAccount } = req);
  } else {
    // No token provided at all
    return res.status(403).send({ message: 'No download token provided.' });
  }

  log.app.info('Auth context in download:', {
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
        message: `Organization not found with name: ${organization}.`,
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
        message: `Box ${boxId} not found in organization ${organization}.`,
      });
    }

    // Function to handle file download and increment counter
    const sendFile = async () => {
      // Find and increment download count
      const fileRecord = await File.findOne({
        where: {
          fileName: 'vagrant.box',
          architectureId: box.versions[0].providers[0].architectures[0].id,
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

      // Get file stats for content-length
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;

      // Set common headers
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Length', fileSize);

      // Handle range requests
      const { range } = req.headers;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const [part0, part1] = parts;
        let start = parseInt(part0, 10);
        let end = part1 ? parseInt(part1, 10) : fileSize - 1;

        // Validate range values
        if (isNaN(start)) {
          start = 0;
        }

        if (isNaN(end) || end >= fileSize) {
          end = fileSize - 1;
        }

        // Ensure start is not greater than end
        if (start > end) {
          log.app.warn(
            `Invalid range request: start (${start}) > end (${end}), adjusting start to 0`
          );
          start = 0;
        }

        // Ensure start is not greater than file size
        if (start >= fileSize) {
          log.app.warn(
            `Range start (${start}) >= file size (${fileSize}), returning 416 Range Not Satisfiable`
          );
          res.setHeader('Content-Range', `bytes */${fileSize}`);
          return res.status(416).send(); // Range Not Satisfiable
        }

        const chunksize = end - start + 1;

        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        res.setHeader('Content-Length', chunksize);
        res.status(206); // Partial Content

        try {
          const fileStream = fs.createReadStream(filePath, { start, end });
          fileStream.pipe(res);

          fileStream.on('error', err => {
            if (!res.headersSent) {
              res.status(500).send({
                message: `Could not download the file. ${err}`,
              });
            }
          });
        } catch (streamErr) {
          log.error.error('Error creating read stream:', {
            error: streamErr.message,
            range: `${start}-${end}`,
            fileSize,
          });
          if (!res.headersSent) {
            res.status(500).send({
              message: `Could not create file stream: ${streamErr.message}`,
            });
          }
        }
      } else if (req.isVagrantRequest) {
        res.status(200);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        // Flush headers immediately so curl can initialize progress display
        res.flushHeaders();

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', err => {
          if (!res.headersSent) {
            res.status(500).send({
              message: `Could not download the file. ${err}`,
            });
          }
        });
      } else {
        // For browser downloads, use express's res.download
        res.download(filePath, fileName, err => {
          if (err && !res.headersSent) {
            res.status(500).send({
              message: `Could not download the file. ${err}`,
            });
          }
        });
      }
      return res;
    };

    // If the box is public or the requester is a service account, allow download
    if (box.isPublic || isServiceAccount) {
      return sendFile();
    }

    // If the box is private, check if the user is member of the organization
    if (!userId) {
      return res.status(403).send({ message: 'Unauthorized access to file download.' });
    }

    const membership = await db.UserOrg.findUserOrgRole(userId, organizationData.id);
    if (!membership) {
      return res.status(403).send({ message: 'Unauthorized access to file download.' });
    }

    // User is member, allow download
    return sendFile();
  } catch (err) {
    return res
      .status(500)
      .send({ message: err.message || 'Some error occurred while downloading the file.' });
  }
};

module.exports = { download };
