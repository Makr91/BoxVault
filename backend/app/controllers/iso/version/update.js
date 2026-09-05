import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
const { isoVersions: IsoVersion } = db;

/**
 * Validate the optional release-notes/deprecation fields of an ISO version
 * update. A request setting deprecated:true must carry (or the version must
 * already store) a non-empty deprecation reason.
 * @param {Object} req - Express request (body + i18n)
 * @param {Object} version - The version being updated
 * @returns {string|null} 400 rejection message, or null when acceptable
 */
const getVersionContentRejection = (req, version) => {
  const { releaseNotes, deprecated, deprecationReason } = req.body;

  if (typeof releaseNotes !== 'undefined' && releaseNotes !== null) {
    if (typeof releaseNotes !== 'string') {
      return req.__('isos.versions.invalidReleaseNotes');
    }
  }
  if (typeof deprecated !== 'undefined' && typeof deprecated !== 'boolean') {
    return req.__('isos.versions.invalidDeprecated');
  }
  if (typeof deprecationReason !== 'undefined' && deprecationReason !== null) {
    if (typeof deprecationReason !== 'string' || deprecationReason.length > 512) {
      return req.__('isos.versions.invalidDeprecationReason');
    }
  }
  if (deprecated === true) {
    const effectiveReason =
      typeof deprecationReason !== 'undefined' ? deprecationReason : version.deprecationReason;
    if (typeof effectiveReason !== 'string' || !effectiveReason.trim()) {
      return req.__('versions.deprecationReasonRequired');
    }
  }
  return null;
};

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
 *               releaseNotes:
 *                 type: string
 *                 nullable: true
 *                 description: Version release notes (absent = unchanged)
 *               deprecated:
 *                 type: boolean
 *                 description: Setting true requires a non-empty deprecationReason (in this request or already stored)
 *               deprecationReason:
 *                 type: string
 *                 maxLength: 512
 *                 nullable: true
 *                 description: Why the version is deprecated (absent = unchanged)
 *     responses:
 *       200:
 *         description: Version updated successfully
 *       400:
 *         description: Invalid field
 *       404:
 *         description: Organization, ISO or version not found
 *       500:
 *         description: Internal server error
 */
const update = async (req, res) => {
  const { versionNumber } = req.params;
  const { description, releaseNotes, deprecated, deprecationReason } = req.body;

  try {
    const { isoData: iso } = req;

    const version = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
    });
    if (!version) {
      return res.status(404).send({ message: req.__('isos.versions.notFound') });
    }

    const contentRejection = getVersionContentRejection(req, version);
    if (contentRejection) {
      return res.status(400).send({ message: contentRejection });
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
