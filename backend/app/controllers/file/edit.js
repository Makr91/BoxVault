import { log } from '../../utils/Logger.js';
import {
  canWriteBox,
  resolveOrgMembership,
  visibilityOf,
  widerThanParent,
} from '../../utils/orgMembership.js';
import { problem, refuse } from '../../utils/problem.js';
import { snakeKeys } from '../../utils/wire.js';
import db from '../../models/index.js';
const { files: File } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}/file:
 *   put:
 *     summary: Set the visibility words of a Vagrant box file
 *     description: Set is_public, guest_access and published on the file row of an architecture, a word wider than the architecture answered 422. The box owner, or an admin or owner of the organization, may set them; a service account acts inside its own organization at its effective role.
 *     tags: [Files]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: architectureName
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
 *         description: The file row
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/File'
 *       403:
 *         description: The caller may not write the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization, box, version, provider, architecture or file not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the boxFile form, or a word reaches past the architecture
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
const edit = async (req, res) => {
  try {
    const { organization: organizationData, box, architecture } = req.entities;

    const membership = await resolveOrgMembership(req, organizationData.id);
    if (!canWriteBox(req, box, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('files.update.permissionDenied'),
      });
    }

    const fileRecord = await File.findOne({
      where: { fileName: 'vagrant.box', architectureId: architecture.id },
    });
    if (!fileRecord) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('files.notFound'),
      });
    }

    const visibility = visibilityOf(req.body);
    const wider = widerThanParent(
      { ...fileRecord.get({ plain: true }), ...visibility },
      architecture
    );
    if (wider) {
      return refuse(res, req, [wider]);
    }

    const updated = await fileRecord.update(visibility);
    return res.send(snakeKeys(updated.get({ plain: true })));
  } catch (err) {
    log.error.error('Error setting the visibility of a file:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('files.update.error', { file: '' }),
    });
  }
};

export { edit };
