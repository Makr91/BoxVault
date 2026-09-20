/**
 * @swagger
 * components:
 *   schemas:
 *     DownloadRelease:
 *       type: object
 *       required:
 *         - version_number
 *         - download_id
 *       properties:
 *         id:
 *           type: integer
 *         version_number:
 *           type: string
 *           description: The release identifier (14.5.1)
 *         description:
 *           type: string
 *         download_id:
 *           type: integer
 *         release_notes:
 *           type: string
 *           nullable: true
 *         deprecated:
 *           type: boolean
 *         deprecation_reason:
 *           type: string
 *           nullable: true
 *         is_public:
 *           type: boolean
 *           description: Whether anyone may read the release; never wider than the product
 *         guest_access:
 *           type: boolean
 *           description: Whether guests of the organization may read the release while it is published; never wider than the product
 *         published:
 *           type: boolean
 *           description: An unpublished release is readable by the product's writers alone
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     DownloadPatch:
 *       type: object
 *       required:
 *         - name
 *         - download_release_id
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *           description: release for the release itself, else the patch identifier (FP1, IF1, FP7HF25)
 *         description:
 *           type: string
 *         kind:
 *           type: string
 *           enum: [release, fixpack, interim-fix, hotfix]
 *         released_at:
 *           type: string
 *           format: date
 *           nullable: true
 *         notes_url:
 *           type: string
 *           nullable: true
 *         is_public:
 *           type: boolean
 *           description: Whether anyone may read the patch; never wider than the release
 *         guest_access:
 *           type: boolean
 *           description: Whether guests of the organization may read the patch while it is published; never wider than the release
 *         published:
 *           type: boolean
 *           description: An unpublished patch is readable by the product's writers alone
 *         download_release_id:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *
 *     DownloadFile:
 *       type: object
 *       required:
 *         - key
 *         - file_name
 *         - download_patch_id
 *       properties:
 *         id:
 *           type: integer
 *         key:
 *           type: string
 *           description: The file's key (linux-x64)
 *         file_name:
 *           type: string
 *         kind:
 *           type: string
 *           enum: [installer, fixpack, hotfix, interim-fix, container-image, package, template, notes, tool, other]
 *         platform:
 *           type: string
 *           enum: [linux, windows, macos, omnios, other, any]
 *         architecture:
 *           type: string
 *           enum: [x64, x86, arm64, other, any]
 *         language:
 *           type: string
 *           description: A BCP 47 tag or any
 *         variant:
 *           type: string
 *           nullable: true
 *         file_size:
 *           type: integer
 *         checksum:
 *           type: string
 *           nullable: true
 *         checksum_type:
 *           type: string
 *           nullable: true
 *         download_count:
 *           type: integer
 *         is_public:
 *           type: boolean
 *           description: Whether anyone may read the file; never wider than the patch
 *         guest_access:
 *           type: boolean
 *           description: Whether guests of the organization may read the file while it is published; never wider than the patch
 *         published:
 *           type: boolean
 *           description: An unpublished file is readable by the product's writers alone
 *         download_patch_id:
 *           type: integer
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import {
  canWriteDownload,
  resolveOrgMembership,
  visibilityOf,
  widerThanParent,
} from '../../../utils/orgMembership.js';
import { conflict, problem, refuse } from '../../../utils/problem.js';
import { getSecureDownloadPath } from '../helpers.js';
const { downloadReleases: DownloadRelease } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release:
 *   post:
 *     summary: Create a release of a download product
 *     description: The product's owner, or an admin or owner of the organization, may create a release; a service account acts inside its own organization at its effective role. A release is born private and unpublished unless the body names is_public, guest_access or published, and it may never stand wider than its product, a wider word answering 422 with the pointer.
 *     tags: [Downloads]
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
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Product name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - version_number
 *             properties:
 *               version_number:
 *                 type: string
 *                 description: Release identifier (the identifier pattern of /api/rules, unique in the product)
 *               description:
 *                 type: string
 *               is_public:
 *                 type: boolean
 *                 default: false
 *               guest_access:
 *                 type: boolean
 *                 default: false
 *               published:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Release created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadRelease'
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization or product not found
 *       409:
 *         description: The release already exists for this product
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the release form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const create = async (req, res) => {
  const { organization } = req.params;
  const { version_number: versionNumber, description } = req.body;

  try {
    const { organizationData, downloadData: download } = req;

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const existingRelease = await DownloadRelease.findOne({
      where: { versionNumber, downloadId: download.id },
    });
    if (existingRelease) {
      return conflict(res, req, '/version_number', download.name);
    }

    const visibility = {
      isPublic: false,
      guestAccess: false,
      published: false,
      ...visibilityOf(req.body),
    };
    const wider = widerThanParent(visibility, download);
    if (wider) {
      return refuse(res, req, [wider]);
    }

    const newFilePath = getSecureDownloadPath(organization, download.name, versionNumber);
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    const release = await DownloadRelease.create({
      versionNumber,
      description,
      ...visibility,
      downloadId: download.id,
    });

    return res.status(201).send(release);
  } catch (err) {
    log.error.error('Error creating download release', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { create };
