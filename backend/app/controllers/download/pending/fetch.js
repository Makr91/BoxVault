import { basename } from 'path';
import db from '../../../models/index.js';
import { loadConfig } from '../../../utils/config-loader.js';
import { log } from '../../../utils/Logger.js';
import { canWriteInOrg, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { problem, refuse } from '../../../utils/problem.js';
import { safeRmdirSync } from '../../../utils/fsHelper.js';
import { openRemote } from '../../../utils/remoteFetch.js';
import { fetchPendingFile, headerErrors } from '../../../middleware/uploadDownload.js';
import { getPendingPath } from '../helpers.js';
import { isAllowedFileName } from '../file/upload.js';
import { pendingFor } from './upload.js';

const { organization: Organization } = db;

const PROTOCOLS = new Set(['http:', 'https:']);
const LOCAL_FAILURES = new Set(['ENOSPC', 'EACCES', 'EPERM', 'EROFS', 'EMFILE', 'ENFILE']);
const GB = 1024 * 1024 * 1024;

const urlOf = raw => {
  try {
    return new URL(String(raw));
  } catch {
    return null;
  }
};

const fileNameOf = (body, url) => {
  if (body.file_name) {
    return String(body.file_name);
  }
  try {
    return basename(decodeURIComponent(url.pathname));
  } catch {
    return '';
  }
};

const bodyErrors = body => {
  const errors = [];
  const url = urlOf(body.url);
  if (!body.url) {
    errors.push({ pointer: '/url', rule: 'required' });
  } else if (!url || !PROTOCOLS.has(url.protocol)) {
    errors.push({ pointer: '/url', rule: 'format', params: { format: 'http(s) URL' } });
  }
  if (body.checksum_type !== undefined && body.checksum_type !== '') {
    headerErrors({ 'x-checksum-type': String(body.checksum_type) }).forEach(error =>
      errors.push({ ...error, pointer: '/checksum_type' })
    );
  }
  return errors;
};

/**
 * The answer for a fetch that failed: 422 for a private host, another scheme
 * or a checksum the bytes do not match, 413 past the maximum size, 500 for a
 * local disk failure, 502 for anything the remote host did or failed to do.
 * Nothing is answered once the caller has gone.
 * @param {import('express').Request} req - The request (i18n)
 * @param {import('express').Response} res - The response
 * @param {Error} err - The failure
 * @returns {import('express').Response|undefined}
 */
const refusalOf = (req, res, err) => {
  if (res.headersSent || res.destroyed) {
    return undefined;
  }
  if (err.code === 'EPRIVATEADDRESS') {
    return refuse(res, req, [{ pointer: '/url', rule: 'publicAddress' }]);
  }
  if (err.code === 'EPROTOCOL') {
    return refuse(res, req, [
      { pointer: '/url', rule: 'format', params: { format: 'http(s) URL' } },
    ]);
  }
  if (err.code === 'ECHECKSUM') {
    return refuse(res, req, [{ pointer: '/checksum', rule: 'matchesContent' }]);
  }
  if (err.code === 'ETOOLARGE') {
    return problem(res, req, {
      status: 413,
      type: 'payload-too-large',
      title: req.__('files.fileTooLarge', { size: err.maxFileSize / GB }),
    });
  }
  if (LOCAL_FAILURES.has(err.code)) {
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('files.upload.error'),
    });
  }
  return problem(res, req, {
    status: 502,
    type: 'bad-gateway',
    errors: [{ pointer: '/url', rule: 'reachable' }],
  });
};

/**
 * @swagger
 * /api/organization/{organization}/download/pending/fetch:
 *   post:
 *     summary: Fetch a download file from a URL into the organization's pending store
 *     description: The first step of a person's upload, the bytes fetched by the server from `url` instead of sent by the caller. Follows up to ten redirects and stores the 200 answer under `file_name`, the last segment of the URL path when absent (letters, digits, dot, dash and underscore); the declared `checksum` and `checksum_type` are verified over the bytes as they arrive and recorded, a sha256 computed when none is declared. A host that is a loopback, private, link-local or reserved address is refused unless `boxvault.fetch_private_addresses` is on. The request stays open until the bytes are stored and answers what a completed pending upload answers; the pending upload is placed by `POST …/pending/{id}/place`. A failed fetch leaves no pending upload, and a caller who goes away ends the fetch. Any member may fetch; a guest may not.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - url
 *             properties:
 *               url:
 *                 type: string
 *                 format: uri
 *                 description: The http(s) URL the bytes are fetched from
 *               file_name:
 *                 type: string
 *                 description: The real file name, the last segment of the URL path when absent
 *               checksum:
 *                 type: string
 *               checksum_type:
 *                 type: string
 *                 enum: [NULL, MD5, SHA1, SHA256, SHA384, SHA512]
 *     responses:
 *       200:
 *         description: The bytes were stored
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 details:
 *                   allOf:
 *                     - $ref: '#/components/schemas/PendingUpload'
 *                     - type: object
 *                       properties:
 *                         is_complete:
 *                           type: boolean
 *                         status:
 *                           type: string
 *                           enum: [complete]
 *                         file_size:
 *                           type: integer
 *       400:
 *         description: The file name is missing or not allowed
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The caller is not a writing member of the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization not found
 *       413:
 *         description: The file is larger than boxvault.box_max_file_size
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A missing or non-http(s) url, a private host, a checksum_type outside the enum, or a checksum the bytes do not match
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *       502:
 *         description: The remote host failed, answered something other than 200 after its redirects, or sent fewer bytes than it announced
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const fetchRemote = async (req, res) => {
  const { organization: organizationName } = req.params;
  const body = req.body || {};
  const uploadTimeoutMs = (loadConfig('app').boxvault?.upload_timeout_hours || 24) * 60 * 60 * 1000;
  req.setTimeout(uploadTimeoutMs);
  res.setTimeout(uploadTimeoutMs);
  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('organizations.organizationNotFoundWithName', {
          organization: organizationName,
        }),
      });
    }

    const membership = await resolveOrgMembership(req, organization.id);
    if (!canWriteInOrg(membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const errors = bodyErrors(body);
    if (errors.length > 0) {
      return refuse(res, req, errors);
    }

    const url = urlOf(body.url);
    const fileName = fileNameOf(body, url);
    if (!isAllowedFileName(fileName)) {
      return problem(res, req, {
        status: 400,
        type: 'bad-request',
        title: req.__('files.invalidFileName'),
      });
    }

    const allowPrivate = loadConfig('app').boxvault?.fetch_private_addresses === true;
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) {
        abort.abort();
      }
    });

    let response;
    try {
      response = await openRemote(url.href, { allowPrivate, signal: abort.signal });
    } catch (err) {
      log.app.warn(`Pending fetch of ${url.host} refused: ${err.code || err.message}`);
      return refusalOf(req, res, err);
    }

    const pending = await pendingFor(organization, req.userId, fileName, null);
    try {
      const answer = await fetchPendingFile(req, { organization, pending }, response, {
        checksum: body.checksum ? String(body.checksum) : undefined,
        checksumType: body.checksum_type ? String(body.checksum_type) : undefined,
      });
      log.file.info(`Pending upload fetched: ${pending.id} from ${url.host}.`);
      return res.send(answer);
    } catch (err) {
      response.destroy();
      safeRmdirSync(getPendingPath(organization.name, pending.id));
      await pending.destroy();
      log.app.warn(
        `Pending fetch ${pending.id} from ${url.host} failed: ${err.code || err.message}`
      );
      return refusalOf(req, res, err);
    }
  } catch (err) {
    log.error.error('Error fetching a pending upload', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { fetchRemote };
