import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import { canSeeDownload, resolveDownloadViewer } from './visibility.js';
const { download: Download, organization: Organization, downloadWatcher: DownloadWatcher } = db;

const notFound = (req, res, key) =>
  problem(res, req, { status: 404, type: 'not-found', title: req.__(key) });

const internal = (req, res, key) =>
  problem(res, req, { status: 500, type: 'internal', title: req.__(key) });

const findVisibleDownload = async (req, res) => {
  const { organization: organizationName, name } = req.params;

  const organization = await Organization.findOne({ where: { name: organizationName } });
  if (!organization) {
    notFound(req, res, 'organizations.organizationNotFound');
    return null;
  }

  const download = await Download.findOne({ where: { name, organizationId: organization.id } });
  if (!download) {
    notFound(req, res, 'downloads.notFound');
    return null;
  }

  const viewer = await resolveDownloadViewer(req);
  if (!canSeeDownload(viewer, download)) {
    problem(res, req, { status: 403, type: 'forbidden', title: req.__('auth.forbidden') });
    return null;
  }

  return download;
};

/**
 * @swagger
 * /api/organization/{organization}/download/{name}/watch:
 *   post:
 *     summary: Watch a download product
 *     description: Add the signed-in user to the product's watchers. Watchers are notified when the product is published. The product must be visible to the user.
 *     tags: [Downloads]
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
 *         description: The product is not visible to the caller
 *       404:
 *         description: Product or organization not found
 *   delete:
 *     summary: Stop watching a download product
 *     tags: [Downloads]
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
 *         description: Product or organization not found
 */
export const watchDownload = async (req, res) => {
  try {
    const download = await findVisibleDownload(req, res);
    if (!download) {
      return undefined;
    }

    const [, created] = await DownloadWatcher.findOrCreate({
      where: { user_id: req.userId, download_id: download.id },
    });

    return res.status(created ? 201 : 200).send({ watched: true });
  } catch (err) {
    log.error.error('Error watching download:', err);
    return internal(req, res, 'downloads.watch.error');
  }
};

export const unwatchDownload = async (req, res) => {
  const { organization: organizationName, name } = req.params;
  try {
    const organization = await Organization.findOne({ where: { name: organizationName } });
    if (!organization) {
      return notFound(req, res, 'organizations.organizationNotFound');
    }

    const download = await Download.findOne({ where: { name, organizationId: organization.id } });
    if (!download) {
      return notFound(req, res, 'downloads.notFound');
    }

    await DownloadWatcher.destroy({ where: { user_id: req.userId, download_id: download.id } });
    return res.send({ watched: false });
  } catch (err) {
    log.error.error('Error unwatching download:', err);
    return internal(req, res, 'downloads.watch.error');
  }
};

/**
 * @swagger
 * /api/user/download-watches:
 *   get:
 *     summary: List the download products the signed-in user watches
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Watched download products
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   download_id:
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
export const listUserDownloadWatches = async (req, res) => {
  try {
    const watches = await DownloadWatcher.findAll({
      where: { user_id: req.userId },
      include: [
        {
          model: Download,
          as: 'download',
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

    const watchedDownloads = watches
      .filter(watch => watch.download)
      .map(watch => ({
        download_id: watch.download.id,
        name: watch.download.name,
        description: watch.download.description,
        organization: watch.download.organization?.name || null,
        logo: watch.download.organization?.logo || null,
      }));

    return res.send(watchedDownloads);
  } catch (err) {
    log.error.error('Error listing watched downloads:', err);
    return internal(req, res, 'downloads.watch.listError');
  }
};
