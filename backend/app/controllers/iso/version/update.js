import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
const { isoVersions: IsoVersion } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}:
 *   put:
 *     summary: Update a specific version of an ISO
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
  } = req.body;

  try {
    const { isoData: iso } = req;

    const version = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
    });
    if (!version) {
      return res.status(404).send({ message: req.__('isos.versions.notFound') });
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

    const updatedVersion = await version.update(updatePayload);

    return res.send(updatedVersion);
  } catch (err) {
    log.error.error('Error updating ISO version', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { update };
