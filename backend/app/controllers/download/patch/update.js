import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import {
  canWriteDownload,
  cascadeBeneath,
  resolveOrgMembership,
  visibilityOf,
  widerThanParent,
  wordsBeneath,
} from '../../../utils/orgMembership.js';
import { conflict, problem, refuse } from '../../../utils/problem.js';
import { relocatePatch, resolveTarget } from '../helpers.js';
const { downloadPatches: DownloadPatch, Sequelize } = db;
const { Op } = Sequelize;

const MISSING_TITLES = {
  download: 'downloads.notFound',
  release: 'downloads.releases.notFound',
};

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/release/{versionNumber}/patch/{patch}:
 *   put:
 *     summary: Update a patch of a release, or move it to another release
 *     description: Update a patch's name, kind, description, release date, notes link or visibility. A rename moves its directory. The members `download` and `release` name the release the patch moves to, each defaulting to the current one, the caller having to be allowed to write both products; the directory moves with it and every file keeps downloading; a name already taken in the target release answers 409, a target that does not exist 404. The product's owner, or an admin or owner of the organization, may update; a service account acts inside its own organization at its effective role. The patch may never stand wider than the release it sits in, a wider is_public, guest_access or published answering 422 with the pointer. A word turned off is turned off on every file beneath the patch as well; a word turned on reaches them only while recursive is true.
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
 *         description: Current patch name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new patch name (the identifier pattern of /api/rules, unique in the release)
 *               download:
 *                 type: string
 *                 description: The product of the same organization the patch moves to (the slug pattern of /api/rules); absent or the current one leaves it in place
 *               release:
 *                 type: string
 *                 description: The release the patch moves to, under `download`; absent means the current release identifier
 *               kind:
 *                 type: string
 *                 enum: [release, fixpack, interim-fix, hotfix]
 *               description:
 *                 type: string
 *               released_at:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *               notes_url:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *                 description: An empty string or null clears the link
 *               is_public:
 *                 type: boolean
 *                 description: Whether anyone may read the patch; never wider than the release (absent = unchanged)
 *               guest_access:
 *                 type: boolean
 *                 description: Whether guests of the organization may read the patch while it is published; never wider than the release (absent = unchanged)
 *               published:
 *                 type: boolean
 *                 description: An unpublished patch is readable by the product's writers alone (absent = unchanged)
 *               recursive:
 *                 type: boolean
 *                 description: Carry the words turned on in this request down to every file beneath; words turned off always go down
 *     responses:
 *       200:
 *         description: Patch updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DownloadPatch'
 *       403:
 *         description: The caller may not write the product, or the target product
 *       404:
 *         description: Organization, product, release, patch or target not found
 *       409:
 *         description: A patch with the name already exists for the release it would sit in
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
const update = async (req, res) => {
  const { organization, patch: patchName } = req.params;
  const {
    name,
    kind,
    description,
    released_at: releasedAt,
    notes_url: notesUrl,
    recursive,
  } = req.body;

  try {
    const { organizationData, downloadData: download, releaseData: release, patchData } = req;

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteDownload(req, download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    const target = await resolveTarget(
      { organizationId: organizationData.id, download, release },
      req.body
    );
    if (target.missing) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__(MISSING_TITLES[target.missing]),
      });
    }
    if (target.download.id !== download.id && !canWriteDownload(req, target.download, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }
    const moving = target.release.id !== release.id;
    const finalName = name || patchName;

    if (moving || finalName !== patchName) {
      const existingPatch = await DownloadPatch.findOne({
        where: {
          name: finalName,
          downloadReleaseId: target.release.id,
          id: { [Op.ne]: patchData.id },
        },
      });
      if (existingPatch) {
        return conflict(res, req, '/name', target.release.versionNumber);
      }
    }

    const updatePayload = {};
    if (typeof kind !== 'undefined') {
      updatePayload.kind = kind;
    }
    if (typeof description !== 'undefined') {
      updatePayload.description = description;
    }
    if (typeof releasedAt !== 'undefined') {
      updatePayload.releasedAt = releasedAt;
    }
    if (typeof notesUrl !== 'undefined') {
      updatePayload.notesUrl = notesUrl === '' ? null : notesUrl;
    }
    const visibility = visibilityOf(req.body);
    Object.assign(updatePayload, visibility);

    const wider = widerThanParent(
      { ...patchData.get({ plain: true }), ...updatePayload },
      target.release
    );
    if (wider) {
      return refuse(res, req, [wider]);
    }

    await patchData.update(updatePayload);
    await cascadeBeneath('patch', [patchData.id], wordsBeneath(visibility, recursive === true));

    const updatedPatch = await relocatePatch(
      organization,
      patchData,
      { download, release },
      target,
      finalName
    );

    return res.send(updatedPatch);
  } catch (err) {
    log.error.error('Error updating download patch', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { update };
