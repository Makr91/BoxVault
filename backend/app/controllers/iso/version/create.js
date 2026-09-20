import db from '../../../models/index.js';
import { log } from '../../../utils/Logger.js';
import { visibilityOf, widerThanParent } from '../../../utils/orgMembership.js';
import { conflict, problem, refuse } from '../../../utils/problem.js';
const { isoVersions: IsoVersion } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/version:
 *   post:
 *     summary: Create a new version for an ISO
 *     description: A version is born private and unpublished unless the body names is_public, guest_access or published, and it may never stand wider than its ISO, a wider word answering 422 with the pointer.
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
 *                 description: Version number (the identifier pattern of /api/rules, unique in the ISO)
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
 *         description: Version created
 *       404:
 *         description: Organization or ISO not found
 *       409:
 *         description: The version already exists for this ISO
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the version form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const create = async (req, res) => {
  const { version_number: versionNumber, description } = req.body;

  try {
    const { isoData: iso } = req;

    const existingVersion = await IsoVersion.findOne({
      where: { versionNumber, isoId: iso.id },
    });
    if (existingVersion) {
      return conflict(res, req, '/version_number', iso.name);
    }

    const visibility = {
      isPublic: false,
      guestAccess: false,
      published: false,
      ...visibilityOf(req.body),
    };
    const wider = widerThanParent(visibility, iso);
    if (wider) {
      return refuse(res, req, [wider]);
    }

    const version = await IsoVersion.create({
      versionNumber,
      description,
      ...visibility,
      isoId: iso.id,
    });

    return res.status(201).send(version);
  } catch (err) {
    log.error.error('Error creating ISO version', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { create };
