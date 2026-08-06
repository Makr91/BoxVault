// artwork.js — box artwork upload (raw image body) and serve
import fs from 'fs';
import { join } from 'path';
import jwt from 'jsonwebtoken';
import configLoader from '../../utils/config-loader.js';
import { getSecureBoxPath } from '../../utils/paths.js';
import { ensureDirSync, safeExistsSync, safeUnlink } from '../../utils/fsHelper.js';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { organization: Organization, box: Box, UserOrg } = db;

// Accepted upload Content-Type → stored filename; anything else is a 415.
const ARTWORK_FILENAMES_BY_TYPE = {
  'image/svg+xml': 'artwork.svg',
  'image/png': 'artwork.png',
  'image/jpeg': 'artwork.jpg',
};

// Stored filename → serve Content-Type. Doubles as a whitelist: an unexpected
// stored value maps to no type and is treated as "no artwork".
const ARTWORK_TYPES_BY_FILENAME = {
  'artwork.svg': 'image/svg+xml',
  'artwork.png': 'image/png',
  'artwork.jpg': 'image/jpeg',
};

const getArtworkSizeCap = () => {
  let maxSizeMb = 5;
  try {
    const appConfig = configLoader.loadConfig('app');
    maxSizeMb = appConfig.boxvault?.artwork_max_size_mb?.value || 5;
  } catch (e) {
    log.error.error(`Failed to load app configuration: ${e.message}`);
  }
  return { maxSizeMb, maxBytes: maxSizeMb * 1024 * 1024 };
};

/**
 * Buffer the raw request body up to maxBytes. The global body parsers skip
 * non-JSON content types, so the stream is still unread here.
 * @param {Object} req - Express request
 * @param {number} maxBytes - Inclusive size cap
 * @returns {Promise<Buffer|null>} Body buffer, or null when the cap was exceeded
 */
const readRawBody = (req, maxBytes) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    let settled = false;
    req.on('data', chunk => {
      if (settled) {
        return;
      }
      received += chunk.length;
      if (received > maxBytes) {
        settled = true;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!settled) {
        settled = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on('error', err => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });

/**
 * Resolve the requesting user id the same way box findone does: an earlier
 * middleware may have set req.userId (external bearer token), else decode the
 * x-access-token JWT; invalid or absent tokens stay anonymous so public-box
 * access keeps working.
 * @param {Object} req - Express request
 * @returns {number|null}
 */
const resolveRequestUserId = req => {
  if (req.userId) {
    return req.userId;
  }
  const token = req.headers['x-access-token'];
  if (!token) {
    return null;
  }
  try {
    const authConfig = configLoader.loadConfig('auth');
    const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
    return decoded.id;
  } catch {
    return null;
  }
};

/**
 * @swagger
 * /api/organization/{organization}/box/{name}/artwork:
 *   post:
 *     summary: Upload box artwork
 *     description: Upload the box artwork image as a raw request body (image/svg+xml, image/png, or image/jpeg). The file is stored in the box's storage directory and the box's artwork filename is updated.
 *     tags: [Boxes]
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
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *     requestBody:
 *       required: true
 *       content:
 *         image/svg+xml:
 *           schema:
 *             type: string
 *             format: binary
 *         image/png:
 *           schema:
 *             type: string
 *             format: binary
 *         image/jpeg:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Artwork uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Box'
 *       403:
 *         description: Permission denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Box not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       413:
 *         description: Artwork larger than the configured size cap
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       415:
 *         description: Unsupported artwork content type
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
export const uploadArtwork = async (req, res) => {
  const { organization, name } = req.params;

  const [rawContentType] = (req.headers['content-type'] || '').split(';');
  const fileName = ARTWORK_FILENAMES_BY_TYPE[rawContentType.trim().toLowerCase()];
  if (!fileName) {
    return res.status(415).send({ message: req.__('boxes.artwork.unsupportedType') });
  }

  const { maxSizeMb, maxBytes } = getArtworkSizeCap();
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return res.status(413).send({ message: req.__('boxes.artwork.tooLarge', { size: maxSizeMb }) });
  }

  try {
    const box = await Box.findOne({
      where: { name, organizationId: req.organizationId },
    });
    if (!box) {
      return res.status(404).send({ message: req.__('boxes.boxNotFound') });
    }

    // Same write rule as box update: owner, or org admin/owner role
    const isOwner = box.userId === req.userId;
    const canUpdate = isOwner || ['admin', 'owner'].includes(req.userOrgRole);
    if (!canUpdate) {
      return res.status(403).send({ message: req.__('boxes.update.permissionDenied') });
    }

    const body = await readRawBody(req, maxBytes);
    if (body === null) {
      return res
        .status(413)
        .send({ message: req.__('boxes.artwork.tooLarge', { size: maxSizeMb }) });
    }

    const boxDir = getSecureBoxPath(organization, name);
    if (!safeExistsSync(boxDir)) {
      ensureDirSync(boxDir);
    }
    fs.writeFileSync(join(boxDir, fileName), body);

    // A re-upload under a different image type would leave the old file behind
    if (box.artwork && box.artwork !== fileName) {
      safeUnlink(getSecureBoxPath(organization, name, box.artwork));
    }

    const updatedBox = await box.update({ artwork: fileName });
    return res.send(updatedBox);
  } catch (err) {
    log.error.error('Error uploading box artwork:', err);
    return res.status(500).send({ message: req.__('boxes.update.error') });
  }
};

/**
 * @swagger
 * /api/organization/{organization}/box/{name}/artwork:
 *   get:
 *     summary: Get box artwork
 *     description: Stream the stored box artwork image. Public for public boxes; private boxes require organization membership or box ownership (same access rules as box findone).
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
 *     responses:
 *       200:
 *         description: Artwork image
 *         content:
 *           image/svg+xml:
 *             schema:
 *               type: string
 *               format: binary
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *           image/jpeg:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Unauthorized access to private box
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Box, organization, or artwork not found
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
export const getArtwork = async (req, res) => {
  const { organization, name } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
    });
    if (!organizationData) {
      return res
        .status(404)
        .send({ message: req.__('organizations.organizationNotFoundWithName', { organization }) });
    }

    const box = await Box.findOne({
      where: { name, organizationId: organizationData.id },
    });
    if (!box) {
      return res.status(404).send({ message: req.__('boxes.boxNotFoundWithName', { name }) });
    }

    // Private boxes: same access rules as box findone (org member or box owner)
    if (!box.isPublic) {
      const userId = resolveRequestUserId(req);
      if (!userId) {
        return res.status(403).send({ message: req.__('boxes.unauthorized') });
      }
      const membership = await UserOrg.findUserOrgRole(userId, organizationData.id);
      const hasAccess = !!membership || box.userId === userId;
      if (!hasAccess) {
        return res.status(403).send({ message: req.__('boxes.unauthorized') });
      }
    }

    const contentType = box.artwork ? ARTWORK_TYPES_BY_FILENAME[box.artwork] : null;
    const artworkPath = contentType ? getSecureBoxPath(organization, name, box.artwork) : null;
    if (!artworkPath || !safeExistsSync(artworkPath)) {
      return res.status(404).send({ message: req.__('boxes.artwork.notFound') });
    }

    res.set('Content-Type', contentType);
    const stream = fs.createReadStream(artworkPath);
    stream.on('error', err => {
      log.error.error('Error streaming box artwork:', err);
      if (res.headersSent) {
        res.end();
      } else {
        res.status(500).send({ message: req.__('boxes.findOne.error', { name }) });
      }
    });
    return stream.pipe(res);
  } catch (err) {
    log.error.error('Error retrieving box artwork:', err);
    return res.status(500).send({ message: req.__('boxes.findOne.error', { name }) });
  }
};
