import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { canSeeIso, resolveIsoViewer } from './visibility.js';
const { iso: ISO, organization: Organization, isoWatcher: IsoWatcher } = db;

const findVisibleIso = async (req, res) => {
  const { organization: organizationName, name } = req.params;

  const organization = await Organization.findOne({ where: { name: organizationName } });
  if (!organization) {
    res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    return null;
  }

  const iso = await ISO.findOne({ where: { name, organizationId: organization.id } });
  if (!iso) {
    res.status(404).send({ message: req.__('isos.notFound') });
    return null;
  }

  const viewer = await resolveIsoViewer(req);
  if (!canSeeIso(viewer, iso)) {
    res.status(403).send({ message: req.__('auth.forbidden') });
    return null;
  }

  return iso;
};

/**
 * @swagger
 * /api/organization/{organization}/iso/{name}/watch:
 *   post:
 *     summary: Watch an ISO
 *     description: Add the signed-in user to the ISO's watchers. Watchers are notified when the ISO is published. The ISO must be visible to the user.
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
 *     responses:
 *       201:
 *         description: Watch created
 *       200:
 *         description: Already watching
 *       403:
 *         description: The ISO is not visible to the caller
 *       404:
 *         description: ISO or organization not found
 *   delete:
 *     summary: Stop watching an ISO
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
 *     responses:
 *       200:
 *         description: Watch removed
 *       404:
 *         description: ISO or organization not found
 */
export const watchIso = async (req, res) => {
  try {
    const iso = await findVisibleIso(req, res);
    if (!iso) {
      return undefined;
    }

    const [, created] = await IsoWatcher.findOrCreate({
      where: { user_id: req.userId, iso_id: iso.id },
    });

    return res.status(created ? 201 : 200).send({ watched: true });
  } catch (err) {
    log.error.error('Error watching ISO:', err);
    return res.status(500).send({ message: req.__('isos.watch.error') });
  }
};

export const unwatchIso = async (req, res) => {
  const { organization: organizationName, name } = req.params;
  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return res.status(404).send({ message: req.__('organizations.organizationNotFound') });
    }

    const iso = await ISO.findOne({ where: { name, organizationId: organization.id } });
    if (!iso) {
      return res.status(404).send({ message: req.__('isos.notFound') });
    }

    await IsoWatcher.destroy({ where: { user_id: req.userId, iso_id: iso.id } });
    return res.send({ watched: false });
  } catch (err) {
    log.error.error('Error unwatching ISO:', err);
    return res.status(500).send({ message: req.__('isos.watch.error') });
  }
};

/**
 * @swagger
 * /api/user/iso-watches:
 *   get:
 *     summary: List the ISOs the signed-in user watches
 *     tags: [ISOs]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Watched ISOs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   isoId:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                     nullable: true
 *                   organization:
 *                     type: string
 *                     nullable: true
 *                   logo:
 *                     type: string
 *                     nullable: true
 */
export const listUserIsoWatches = async (req, res) => {
  try {
    const watches = await IsoWatcher.findAll({
      where: { user_id: req.userId },
      include: [
        {
          model: ISO,
          as: 'iso',
          attributes: ['id', 'name', 'description'],
          include: [
            {
              model: Organization,
              as: 'organization',
              attributes: ['name', 'logo'],
            },
          ],
        },
      ],
    });

    const watchedIsos = watches
      .filter(watch => watch.iso)
      .map(watch => ({
        isoId: watch.iso.id,
        name: watch.iso.name,
        description: watch.iso.description,
        organization: watch.iso.organization?.name || null,
        logo: watch.iso.organization?.logo || null,
      }));

    return res.send(watchedIsos);
  } catch (err) {
    log.error.error('Error listing watched ISOs:', err);
    return res.status(500).send({ message: req.__('isos.watch.listError') });
  }
};
