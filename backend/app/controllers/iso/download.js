import fs from 'fs';
import { join } from 'path';
import db from '../../models/index.js';
import { getIsoStorageRoot } from './helpers.js';
import { log } from '../../utils/Logger.js';

const { iso: ISO, organization: Organization, UserOrg } = db;

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
const serveIso = async (req, res, iso, token) => {
  void token;
  try {
    const fullPath = join(getIsoStorageRoot(), iso.storagePath);

    // Check permissions: Allow if public, otherwise require org membership
    if (!iso.isPublic) {
      const { userId } = req;

      // Security Check: Ensure token was issued for THIS specific ISO
      if (req.downloadTokenDecoded) {
        const decoded = req.downloadTokenDecoded;
        if (decoded.isoId !== iso.id) {
          log.app.warn(
            `Invalid download token scope. Token ISO: ${decoded.isoId}, Requested: ${iso.id}`
          );
          res.status(403).send({ message: req.__('auth.invalidToken') });
          return;
        }
      }

      if (!userId) {
        res.status(401).send({ message: req.__('auth.unauthorized') });
        return;
      }

      const isMember = await UserOrg.findOne({
        where: { user_id: userId, organization_id: iso.organizationId },
      });

      if (!isMember) {
        res.status(403).send({ message: req.__('auth.forbidden') });
        return;
      }
    }

    // Check if file exists and is readable
    try {
      await fs.promises.access(fullPath, fs.constants.R_OK);
    } catch (e) {
      log.error.error(`ISO file not found or not readable: ${fullPath}`, e);
      res.status(404).send({ message: req.__('files.notFound') });
      return;
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
  } catch (err) {
    log.error.error('Error downloading ISO', err);
    if (!res.headersSent) {
      res.status(500).send({ message: req.__('errors.operationFailed') });
      return;
    }
    res.end();
  }
};

const download = async (req, res) => {
  const { isoId } = req.params;
  const { token } = req.query;

  try {
    const iso = await ISO.findByPk(isoId);
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }
    return await serveIso(req, res, iso, token);
  } catch (err) {
    log.error.error('Error downloading ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

const downloadByName = async (req, res) => {
  const { organization, name } = req.params;
  const { token } = req.query;

  try {
    const org = await Organization.findOne({ where: { name: organization } });
    if (!org) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    const iso = await ISO.findOne({ where: { name, organizationId: org.id } });
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    return await serveIso(req, res, iso, token);
  } catch (err) {
    log.error.error('Error downloading ISO by name', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { download, downloadByName };
