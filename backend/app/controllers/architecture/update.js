// update.js
import { getSecureBoxPath, isOccupiedTarget, renameDirectory } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { conflict, problem, refuse } from '../../utils/problem.js';
import db from '../../models/index.js';
import {
  canWriteBox,
  cascadeBeneath,
  resolveOrgMembership,
  visibilityOf,
  widerThanParent,
  wordsBeneath,
} from '../../utils/orgMembership.js';
const { architectures: Architecture, Sequelize } = db;
const { Op } = Sequelize;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   put:
 *     summary: Update an architecture by name
 *     description: Update an architecture's properties including name, default status and the visibility words is_public, guest_access and published, a word wider than the provider answered 422. A word turned off is turned off on the file beneath the architecture as well; a word turned on reaches it only while recursive is true. Also handles file system directory renaming when architecture name changes. The box owner, or an admin or owner of the organization, may update; a service account acts inside its own organization at its effective role.
 *     tags: [Architectures]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: myorg
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name
 *         example: ubuntu-server
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *         example: "1.0.0"
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *         example: virtualbox
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Current architecture name to update
 *         example: amd64
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New architecture name (the identifier pattern of /api/rules, unique in the provider)
 *                 example: arm64
 *               description:
 *                 type: string
 *                 description: Architecture description
 *               default_box:
 *                 type: boolean
 *                 description: Whether this should be the default architecture for the provider
 *                 example: true
 *               is_public:
 *                 type: boolean
 *                 description: Never wider than the provider
 *               guest_access:
 *                 type: boolean
 *                 description: Never wider than the provider
 *               published:
 *                 type: boolean
 *                 description: Never wider than the provider
 *               recursive:
 *                 type: boolean
 *                 description: Carry the words turned on in this request down to the file beneath; words turned off always go down
 *     responses:
 *       200:
 *         description: Architecture updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization, box, version, provider, or architecture not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       409:
 *         description: An architecture with the new name already exists for the provider
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the architecture form
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
export const update = async (req, res) => {
  const { architectureName } = req.params;
  const { name, description, default_box: defaultBox, recursive } = req.body;

  try {
    const { organizationData, boxData: box, versionData: version, providerData: provider } = req;

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, organizationData.id);
    const canUpdate = canWriteBox(req, box, membership);

    if (!canUpdate) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('architectures.update.permissionDenied'),
      });
    }

    const current = await Architecture.findOne({
      where: { name: architectureName, providerId: provider.id },
    });
    if (!current) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('architectures.notFound'),
      });
    }

    const finalName = name || current.name;
    if (finalName !== current.name) {
      const existingArchitecture = await Architecture.findOne({
        where: { name: finalName, providerId: provider.id, id: { [Op.ne]: current.id } },
      });
      if (existingArchitecture) {
        return conflict(res, req, '/name', provider.name);
      }
    }

    const visibility = visibilityOf(req.body);
    if (Object.keys(visibility).length > 0) {
      const wider = widerThanParent({ ...current.get({ plain: true }), ...visibility }, provider);
      if (wider) {
        return refuse(res, req, [wider]);
      }
    }

    const oldFilePath = getSecureBoxPath(
      organizationData.name,
      box.name,
      version.versionNumber,
      provider.name,
      current.name
    );
    const newFilePath = getSecureBoxPath(
      organizationData.name,
      box.name,
      version.versionNumber,
      provider.name,
      finalName
    );
    if (isOccupiedTarget(oldFilePath, newFilePath)) {
      return conflict(res, req, '/name', provider.name);
    }
    renameDirectory(oldFilePath, newFilePath);

    const updatePayload = {};
    if (name) {
      updatePayload.name = name;
    }
    if (typeof description !== 'undefined') {
      updatePayload.description = description;
    }
    if (typeof defaultBox !== 'undefined') {
      updatePayload.defaultBox = defaultBox;
    }
    Object.assign(updatePayload, visibility);

    const [updated] = await Architecture.update(updatePayload, {
      where: { name: architectureName, providerId: provider.id },
    });

    if (updated) {
      const updatedArchitecture = await Architecture.findOne({
        where: { name: name || architectureName, providerId: provider.id },
      });
      await cascadeBeneath(
        'architecture',
        [updatedArchitecture.id],
        wordsBeneath(visibility, recursive === true)
      );
      return res.send(updatedArchitecture);
    }

    throw new Error(req.__('architectures.notFound'));
  } catch (err) {
    log.error.error('Error updating architecture:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('architectures.update.error'),
    });
  }
};
