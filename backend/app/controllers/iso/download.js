const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('../../models');
const { loadConfig } = require('../../utils/config-loader');
const { getIsoStorageRoot } = require('./helpers');
const { log } = require('../../utils/Logger');

const ISO = db.iso;
const { UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{isoId}/download:
 *   get:
 *     summary: Download an ISO file
 *     description: Download the physical ISO file. Public ISOs can be downloaded by anyone; private ISOs require organization membership.
 *     tags: [ISOs]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: isoId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the ISO to download
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: Optional short-lived download token
 *     responses:
 *       200:
 *         description: File download stream
 *       403:
 *         description: Forbidden
 *       404:
 *         description: ISO or file not found
 */
const download = async (req, res) => {
  const { isoId } = req.params;
  const { token } = req.query;

  try {
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    // Check permissions: Allow if public, otherwise require org membership
    if (!iso.isPublic) {
      let { userId } = req;

      // If no userId from session, try to verify the query token
      if (!userId && token) {
        try {
          const authConfig = loadConfig('auth');
          const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
          ({ userId } = decoded);

          // Security Check: Ensure token was issued for THIS specific ISO
          if (decoded.isoId !== parseInt(isoId, 10)) {
            log.app.warn(
              `Invalid download token scope. Token ISO: ${decoded.isoId}, Requested: ${isoId}`
            );
            return res.status(403).send({ message: req.__('auth.invalidToken') });
          }
        } catch {
          log.app.warn('Invalid download token provided');
        }
      }

      if (!userId) {
        return res.status(401).send({ message: req.__('auth.unauthorized') });
      }

      const isMember = await UserOrg.findOne({
        where: { user_id: userId, organization_id: iso.organizationId },
      });

      if (!isMember) {
        return res.status(403).send({ message: req.__('auth.forbidden') });
      }
    }

    const fullPath = path.join(getIsoStorageRoot(), iso.storagePath);

    // Check if file exists and is readable
    try {
      await fs.promises.access(fullPath, fs.constants.R_OK);
    } catch (e) {
      log.error.error(`ISO file not found or not readable: ${fullPath}`, e);
      return res.status(404).send({ message: req.__('files.notFound') });
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const fileName = iso.filename;

    // Handle Range requests (Resumable downloads)
    const { range } = req.headers;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;

      const fileStream = fs.createReadStream(fullPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      });
      fileStream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      });
      const fileStream = fs.createReadStream(fullPath);
      fileStream.pipe(res);
    }

    return null;
  } catch (err) {
    log.error.error('Error downloading ISO', err);
    if (!res.headersSent) {
      return res.status(500).send({ message: req.__('errors.operationFailed') });
    }
    return null;
  }
};

module.exports = { download };
