import fs from 'fs';
import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { canWriteDownload, resolveOrgMembership } from '../../../utils/orgMembership.js';
import { conflict, problem } from '../../../utils/problem.js';
import { getSecureDownloadPath } from '../helpers.js';
const { downloadPatches: DownloadPatch } = db;

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch:
 *   post:
 *     summary: Create a patch of a release
 *     description: Create a patch (the release itself as `release`, else FP1, IF1, FP7HF25) under a release. The product's owner, or an admin or owner of the organization, may create; a service account acts inside its own organization at its effective role.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Patch identifier (the identifier pattern of /api/rules, unique in the release; release names the release itself)
 *               kind:
 *                 type: string
 *                 enum: [release, fixpack, interim-fix, hotfix]
 *               description:
 *                 type: string
 *               released_at:
 *                 type: string
 *                 format: date
 *               notes_url:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Patch created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadPatch'
 *       403:
 *         description: The caller may not write the product
 *       404:
 *         description: Organization, product or release not found
 *       409:
 *         description: A patch with that name already exists for the release
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the patch form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const create = async (req, res) => {
  const { organization } = req.params;
  const { name, kind, description, released_at: releasedAt, notes_url: notesUrl } = req.body;

  try {
    const { organizationData, downloadData: download, releaseData: release } = req;

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const existingPatch = await DownloadPatch.findOne({
      where: { name, downloadReleaseId: release.id },
    });
    if (existingPatch) {
      return conflict(res, req, '/name', release.versionNumber);
    }

    const newFilePath = getSecureDownloadPath(
      organization,
      download.name,
      release.versionNumber,
      name
    );
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    const patch = await DownloadPatch.create({
      name,
      kind: kind || 'release',
      description,
      releasedAt: releasedAt || null,
      notesUrl: notesUrl || null,
      downloadReleaseId: release.id,
    });

    return res.status(201).send(patch);
  } catch (err) {
    log.error.error('Error creating download patch', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { create };
