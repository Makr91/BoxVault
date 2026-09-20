import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import {
  canWriteDownload,
  resolveOrgMembership,
  visibilityOf,
  widerThanParent,
} from '../../../utils/orgMembership.js';
import { conflict, problem, refuse } from '../../../utils/problem.js';
const { downloadFiles: DownloadFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}/file:
 *   post:
 *     summary: Create a file row of a patch
 *     description: Create the record of a file under a patch before its bytes are uploaded. The product's owner, or an admin or owner of the organization, may create; a service account acts inside its own organization at its effective role. A file is born private, closed to guests and unpublished unless the body says otherwise, and never wider than its patch, a wider word answered 422.
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
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Release identifier
 *       - in: path
 *         name: patch
 *         required: true
 *         schema:
 *           type: string
 *         description: Patch name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *             properties:
 *               key:
 *                 type: string
 *                 description: File key (the identifier pattern of /api/rules, unique in the patch)
 *               file_name:
 *                 type: string
 *                 description: The name the file is stored and served under; the key when absent
 *               kind:
 *                 type: string
 *                 enum: [installer, fixpack, hotfix, interim-fix, container-image, package, template, notes, tool, other]
 *               platform:
 *                 type: string
 *                 enum: [linux, windows, macos, omnios, other, any]
 *               architecture:
 *                 type: string
 *                 enum: [x64, x86, arm64, other, any]
 *               language:
 *                 type: string
 *                 description: A BCP 47 tag or any
 *               variant:
 *                 type: string
 *               checksum_type:
 *                 type: string
 *                 enum: [NULL, MD5, SHA1, SHA256, SHA384, SHA512]
 *               checksum:
 *                 type: string
 *               is_public:
 *                 type: boolean
 *                 description: False when absent; never wider than the patch
 *               guest_access:
 *                 type: boolean
 *                 description: False when absent; never wider than the patch
 *               published:
 *                 type: boolean
 *                 description: False when absent; never wider than the patch
 *     responses:
 *       201:
 *         description: File row created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadFile'
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization, product, release or patch not found
 *       409:
 *         description: A file with that key already exists for the patch
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the downloadFile form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const create = async (req, res) => {
  const {
    key,
    file_name: fileName,
    kind,
    platform,
    architecture,
    language,
    variant,
    checksum_type: checksumType,
    checksum,
  } = req.body;

  try {
    const { organizationData, downloadData: download, patchData: patch } = req;

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const existingFile = await DownloadFile.findOne({
      where: { key, downloadPatchId: patch.id },
    });
    if (existingFile) {
      return conflict(res, req, '/key', patch.name);
    }

    const visibility = {
      isPublic: false,
      guestAccess: false,
      published: false,
      ...visibilityOf(req.body),
    };
    const wider = widerThanParent(visibility, patch);
    if (wider) {
      return refuse(res, req, [wider]);
    }

    const file = await DownloadFile.create({
      key,
      fileName: fileName || key,
      kind: kind || 'other',
      platform: platform || 'any',
      architecture: architecture || 'any',
      language: language || 'any',
      variant: variant || null,
      checksumType: checksumType || null,
      checksum: checksum ? checksum.toLowerCase() : null,
      fileSize: 0,
      storagePath: null,
      original: true,
      linksTo: null,
      ...visibility,
      downloadPatchId: patch.id,
    });

    return res.status(201).send(file);
  } catch (err) {
    log.error.error('Error creating download file', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { create };
