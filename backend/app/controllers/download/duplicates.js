import db from '../../models/index.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
const {
  download: Download,
  downloadReleases: DownloadRelease,
  downloadPatches: DownloadPatch,
  downloadFiles: DownloadFile,
} = db;

const addressOf = file => ({
  product: file.patch.release.download.name,
  release: file.patch.release.versionNumber,
  patch: file.patch.name,
  key: file.key,
  file_name: file.fileName,
  file_size: Number(file.fileSize),
  original: file.original,
});

/**
 * @swagger
 * /api/organization/{organization}/download/duplicates:
 *   get:
 *     summary: The files of an organization that share a checksum
 *     description: Every checksum carried by more than one file row of the organization's download products, each with the rows that carry it and their addresses, the row owning the bytes flagged original. A writing member of the organization may read it.
 *     tags: [Downloads]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: The duplicate groups, the largest first
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   checksum:
 *                     type: string
 *                   checksum_type:
 *                     type: string
 *                   files:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         product:
 *                           type: string
 *                         release:
 *                           type: string
 *                         patch:
 *                           type: string
 *                         key:
 *                           type: string
 *                         file_name:
 *                           type: string
 *                         file_size:
 *                           type: integer
 *                         original:
 *                           type: boolean
 *       403:
 *         description: The caller may not write in the organization
 *       404:
 *         description: Organization not found
 *       500:
 *         description: Internal server error
 */
const duplicates = async (req, res) => {
  try {
    const files = await DownloadFile.findAll({
      where: { checksum: { [db.Sequelize.Op.ne]: null } },
      include: [
        {
          model: DownloadPatch,
          as: 'patch',
          attributes: ['name'],
          required: true,
          include: [
            {
              model: DownloadRelease,
              as: 'release',
              attributes: ['versionNumber'],
              required: true,
              include: [
                {
                  model: Download,
                  as: 'download',
                  attributes: ['name'],
                  required: true,
                  where: { organizationId: req.organizationId },
                },
              ],
            },
          ],
        },
      ],
    });

    const groups = new Map();
    files.forEach(file => {
      const group = groups.get(file.checksum) || {
        checksum: file.checksum,
        checksum_type: file.checksumType,
        files: [],
      };
      group.files.push(addressOf(file));
      groups.set(file.checksum, group);
    });

    const answer = [...groups.values()]
      .filter(group => group.files.length > 1)
      .sort((left, right) => right.files.length - left.files.length);

    return res.send(answer);
  } catch (err) {
    log.error.error('Error listing duplicate download files', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { duplicates };
