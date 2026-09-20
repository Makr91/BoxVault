import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { conflict, problem, refuse } from '../../utils/problem.js';
import { parseBoxContentFields } from '../box/helpers.js';
import { cascadeBeneath, visibilityOf, wordsBeneath } from '../../utils/orgMembership.js';
import { notifyIsoPublished } from './notifications.js';
const { iso: ISO, organization: Organization, Sequelize } = db;
const { Op } = Sequelize;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}:
 *   put:
 *     summary: Update ISO details
 *     description: Update the name, description, visibility, publication state or metadata of an ISO. Absent fields stay unchanged. A visibility word turned off is turned off on every version and file beneath the ISO as well; a word turned on reaches them only while recursive is true.
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
 *         description: Current ISO name
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New ISO name (the slug pattern of /api/rules, unique in the organization)
 *               description:
 *                 type: string
 *               is_public:
 *                 type: boolean
 *               guest_access:
 *                 type: boolean
 *                 description: Whether guests of the organization may read the ISO while it is published
 *               published:
 *                 type: boolean
 *                 description: Unpublished ISOs are visible to organization members only
 *               recursive:
 *                 type: boolean
 *                 description: Carry the visibility words turned on in this request down to every row beneath the ISO; words turned off always go down
 *               metadata:
 *                 type: object
 *                 nullable: true
 *                 description: Structured facts pushed by the build pipeline (whitelisted top-level keys only, absent = unchanged)
 *     responses:
 *       200:
 *         description: ISO updated successfully
 *       404:
 *         description: ISO not found
 *       409:
 *         description: An ISO with the new name already exists in the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the ISO form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 */
const update = async (req, res) => {
  const { organization, name } = req.params;
  const body = req.body || {};
  const {
    name: updatedName,
    description,
    published,
    is_public: isPublic,
    guest_access: guestAccess,
    recursive,
  } = body;

  const { errors: contentErrors, fields: contentFields } = parseBoxContentFields(body);
  if (contentErrors.length > 0) {
    return refuse(res, req, contentErrors);
  }

  try {
    const iso = await ISO.findOne({
      where: { name, organizationId: req.organizationId },
    });
    if (!iso) {
      return problem(res, req, { status: 404, type: 'not-found', title: req.__('isos.notFound') });
    }

    if (updatedName && updatedName !== name) {
      const existingIso = await ISO.findOne({
        where: {
          name: updatedName,
          organizationId: req.organizationId,
          id: { [Op.ne]: iso.id },
        },
      });
      if (existingIso) {
        return conflict(res, req, '/name', organization);
      }
    }

    const wasPublished = iso.published;

    const updatedIso = await iso.update({
      name: updatedName || name,
      description: description !== undefined ? description : iso.description,
      published: published !== undefined ? published : iso.published,
      isPublic: isPublic !== undefined ? isPublic : iso.isPublic,
      guestAccess: guestAccess !== undefined ? guestAccess : iso.guestAccess,
      ...(Object.hasOwn(contentFields, 'metadata') ? { metadata: contentFields.metadata } : {}),
    });
    await cascadeBeneath('iso', [iso.id], wordsBeneath(visibilityOf(body), recursive === true));

    if (updatedIso.published && !wasPublished) {
      const organizationData = await Organization.findByPk(updatedIso.organizationId);
      notifyIsoPublished(organizationData, updatedIso);
    }

    return res.send(updatedIso);
  } catch (err) {
    log.error.error('Error updating ISO', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { update };
