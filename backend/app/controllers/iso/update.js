import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { parseBoxContentFields } from '../box/helpers.js';
import { notifyIsoPublished } from './notifications.js';
const { iso: ISO, organization: Organization } = db;

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}:
 *   put:
 *     summary: Update ISO details
 *     description: Update the name, description, visibility, publication state or metadata of an ISO. Absent fields stay unchanged.
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
 *                 description: New ISO name
 *               description:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *               published:
 *                 type: boolean
 *                 description: Unpublished ISOs are visible to organization members only
 *               metadata:
 *                 type: object
 *                 nullable: true
 *                 description: Structured facts pushed by the build pipeline (whitelisted top-level keys only, absent = unchanged)
 *     responses:
 *       200:
 *         description: ISO updated successfully
 *       400:
 *         description: Invalid name or metadata
 *       404:
 *         description: ISO not found
 *       409:
 *         description: An ISO with the new name already exists in the organization
 *       500:
 *         description: Internal server error
 */
const update = async (req, res) => {
  const { name } = req.params;
  const body = req.body || {};
  const { name: updatedName, description, published, isPublic } = body;

  const { error: contentError, fields: contentFields } = parseBoxContentFields(body);
  if (contentError) {
    return res.status(400).send({ message: contentError });
  }

  try {
    const iso = await ISO.findOne({
      where: { name, organizationId: req.organizationId },
    });
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    const wasPublished = iso.published;

    const updatedIso = await iso.update({
      name: updatedName || name,
      description: description !== undefined ? description : iso.description,
      published: published !== undefined ? published : iso.published,
      isPublic: isPublic !== undefined ? isPublic : iso.isPublic,
      ...(Object.hasOwn(contentFields, 'metadata') ? { metadata: contentFields.metadata } : {}),
    });

    if (updatedIso.published && !wasPublished) {
      const organization = await Organization.findByPk(updatedIso.organizationId);
      notifyIsoPublished(organization, updatedIso);
    }

    return res.send(updatedIso);
  } catch (err) {
    log.error.error('Error updating ISO', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};

export { update };
