import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { visibilityOf, widerThanParent } from '../../../utils/orgMembership.js';
import { problem, refuse } from '../../../utils/problem.js';
import { isoFilesWithCounts } from '../helpers.js';
const { isoFiles: IsoFile } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version/{versionNumber}/architecture/{architecture}/file:
 *   put:
 *     summary: Set the visibility words of an ISO file
 *     description: Set is_public, guest_access and published on the file record of one architecture of a version, a word wider than the version answered 422. An admin or owner of the organization may set them.
 *     tags: [ISOs]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: architecture
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_public:
 *                 type: boolean
 *               guest_access:
 *                 type: boolean
 *               published:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: The file record
 *       403:
 *         description: The caller does not administer the organization
 *       404:
 *         description: Organization, ISO, version or file not found
 *       422:
 *         description: A value breaks a rule of the isoFile form, or a word reaches past the version
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const edit = async (req, res) => {
  const { architecture } = req.params;

  try {
    const { version } = req.entities;

    const fileRecord = await IsoFile.findOne({
      where: { isoVersionId: version.id, architecture },
    });
    if (!fileRecord) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('files.notFound'),
      });
    }

    const visibility = visibilityOf(req.body);
    const wider = widerThanParent({ ...fileRecord.get({ plain: true }), ...visibility }, version);
    if (wider) {
      return refuse(res, req, [wider]);
    }

    const updated = await fileRecord.update(visibility);
    const [answer] = isoFilesWithCounts([updated], true);
    return res.send(answer);
  } catch (err) {
    log.error.error('Error setting the visibility of an ISO file', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { edit };
