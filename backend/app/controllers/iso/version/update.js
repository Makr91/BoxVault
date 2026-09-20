import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import {
  cascadeBeneath,
  visibilityOf,
  widerThanParent,
  wordsBeneath,
} from '../../../utils/orgMembership.js';
import { problem, refuse } from '../../../utils/problem.js';
const { isoVersions: IsoVersion } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}:
 *   put:
 *     summary: Update a specific version of an ISO
 *     description: The version may never stand wider than its ISO, a wider is_public, guest_access or published answering 422 with the pointer. A word turned off is turned off on every file beneath the version as well; a word turned on reaches them only while recursive is true.
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
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: ISO name
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               description:
 *                 type: string
 *               release_notes:
 *                 type: string
 *                 nullable: true
 *                 description: Version release notes (absent = unchanged)
 *               is_public:
 *                 type: boolean
 *                 description: Whether anyone may read the version; never wider than the ISO (absent = unchanged)
 *               guest_access:
 *                 type: boolean
 *                 description: Whether guests of the organization may read the version while it is published; never wider than the ISO (absent = unchanged)
 *               published:
 *                 type: boolean
 *                 description: An unpublished version is readable by the ISO's writers alone (absent = unchanged)
 *               recursive:
 *                 type: boolean
 *                 description: Carry the words turned on in this request down to every file beneath; words turned off always go down
 *               deprecated:
 *                 type: boolean
 *                 description: Setting true requires a non-empty deprecation_reason in this request
 *               deprecation_reason:
 *                 type: string
 *                 maxLength: 512
 *                 nullable: true
 *                 description: Why the version is deprecated (absent = unchanged)
 *     responses:
 *       200:
 *         description: Version updated successfully
 *       404:
 *         description: Organization, ISO or version not found
 *       422:
 *         description: A value breaks a rule of the version form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const update = async (req, res) => {
  const { versionNumber } = req.params;
  const {
    description,
    release_notes: releaseNotes,
    deprecated,
    deprecation_reason: deprecationReason,
    recursive,
  } = req.body;

  try {
    const { isoData: iso } = req;

    const version = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
    });
    if (!version) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('isos.versions.notFound'),
      });
    }

    const updatePayload = {};
    if (typeof description !== 'undefined') {
      updatePayload.description = description;
    }
    if (typeof releaseNotes !== 'undefined') {
      updatePayload.releaseNotes = releaseNotes;
    }
    if (typeof deprecated !== 'undefined') {
      updatePayload.deprecated = deprecated;
    }
    if (typeof deprecationReason !== 'undefined') {
      updatePayload.deprecationReason = deprecationReason;
    }
    const visibility = visibilityOf(req.body);
    Object.assign(updatePayload, visibility);

    const wider = widerThanParent({ ...version.get({ plain: true }), ...updatePayload }, iso);
    if (wider) {
      return refuse(res, req, [wider]);
    }

    const updatedVersion = await version.update(updatePayload);
    await cascadeBeneath('isoVersion', [version.id], wordsBeneath(visibility, recursive === true));

    return res.send(updatedVersion);
  } catch (err) {
    log.error.error('Error updating ISO version', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { update };
