import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { organization: Organization, box: Box, boxWatcher: BoxWatcher, UserOrg } = db;

const notFound = (req, res, title) => problem(res, req, { status: 404, type: 'not-found', title });

const internal = (req, res, key) =>
  problem(res, req, { status: 500, type: 'internal', title: req.__(key) });

const findVisibleBox = async (req, res) => {
  const { organization, name } = req.params;

  const organizationData = await Organization.findOne({ where: { name: organization } });
  if (!organizationData) {
    notFound(req, res, req.__('organizations.organizationNotFoundWithName', { organization }));
    return null;
  }

  const box = await Box.findOne({ where: { name, organizationId: organizationData.id } });
  if (!box) {
    notFound(req, res, req.__('boxes.boxNotFoundWithName', { name }));
    return null;
  }

  if (!box.isPublic) {
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    if (!membership && box.userId !== req.userId) {
      problem(res, req, { status: 403, type: 'forbidden', title: req.__('boxes.unauthorized') });
      return null;
    }
  }

  return box;
};

export const watchBox = async (req, res) => {
  try {
    const box = await findVisibleBox(req, res);
    if (!box) {
      return undefined;
    }

    const [, created] = await BoxWatcher.findOrCreate({
      where: { user_id: req.userId, box_id: box.id },
    });

    return res.status(created ? 201 : 200).send({ watched: true });
  } catch (err) {
    log.error.error('Error watching box:', err);
    return internal(req, res, 'boxes.watch.error');
  }
};

export const unwatchBox = async (req, res) => {
  const { organization, name } = req.params;
  try {
    const organizationData = await Organization.findOne({ where: { name: organization } });
    if (!organizationData) {
      return notFound(
        req,
        res,
        req.__('organizations.organizationNotFoundWithName', { organization })
      );
    }

    const box = await Box.findOne({ where: { name, organizationId: organizationData.id } });
    if (!box) {
      return notFound(req, res, req.__('boxes.boxNotFoundWithName', { name }));
    }

    await BoxWatcher.destroy({ where: { user_id: req.userId, box_id: box.id } });
    return res.send({ watched: false });
  } catch (err) {
    log.error.error('Error unwatching box:', err);
    return internal(req, res, 'boxes.watch.error');
  }
};

export const listUserWatches = async (req, res) => {
  try {
    const watches = await BoxWatcher.findAll({
      where: { user_id: req.userId },
      include: [
        {
          model: Box,
          as: 'box',
          attributes: ['id', 'name', 'shortDescription'],
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

    const watchedBoxes = watches
      .filter(watch => watch.box)
      .map(watch => ({
        boxId: watch.box.id,
        name: watch.box.name,
        shortDescription: watch.box.shortDescription,
        organization: watch.box.organization?.name || null,
        logo: watch.box.organization?.logo || null,
      }));

    return res.send(watchedBoxes);
  } catch (err) {
    log.error.error('Error listing watched boxes:', err);
    return internal(req, res, 'boxes.watch.listError');
  }
};
