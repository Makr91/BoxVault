import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
const { organization: Organization, box: Box, boxWatcher: BoxWatcher, UserOrg } = db;

const findVisibleBox = async (req, res) => {
  const { organization, name } = req.params;

  const organizationData = await Organization.findOne({ where: { name: organization } });
  if (!organizationData) {
    res
      .status(404)
      .send({ message: req.__('organizations.organizationNotFoundWithName', { organization }) });
    return null;
  }

  const box = await Box.findOne({ where: { name, organizationId: organizationData.id } });
  if (!box) {
    res.status(404).send({ message: req.__('boxes.boxNotFoundWithName', { name }) });
    return null;
  }

  if (!box.isPublic) {
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    if (!membership && box.userId !== req.userId) {
      res.status(403).send({ message: req.__('boxes.unauthorized') });
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
    return res.status(500).send({ message: req.__('boxes.watch.error') });
  }
};

export const unwatchBox = async (req, res) => {
  const { organization, name } = req.params;
  try {
    const organizationData = await Organization.findOne({ where: { name: organization } });
    if (!organizationData) {
      return res
        .status(404)
        .send({ message: req.__('organizations.organizationNotFoundWithName', { organization }) });
    }

    const box = await Box.findOne({ where: { name, organizationId: organizationData.id } });
    if (!box) {
      return res.status(404).send({ message: req.__('boxes.boxNotFoundWithName', { name }) });
    }

    await BoxWatcher.destroy({ where: { user_id: req.userId, box_id: box.id } });
    return res.send({ watched: false });
  } catch (err) {
    log.error.error('Error unwatching box:', err);
    return res.status(500).send({ message: req.__('boxes.watch.error') });
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
    return res.status(500).send({ message: req.__('boxes.watch.listError') });
  }
};
