import { log } from '../../../utils/Logger.js';
import { problem } from '../../../utils/problem.js';
import { pendingSummary } from '../helpers.js';
import { resolvePending } from './resolve.js';

/**
 * @swagger
 * /api/organization/{organization}/download/pending/{id}/info:
 *   get:
 *     summary: Get pending upload information
 *     description: The assembled size of a pending upload for the upload zone's poll, with the members the file info route answers where they apply; `fileSize` is null until the bytes are assembled. Any member of the organization may read it; an id of another organization answers 404.
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
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pending upload information
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PendingUpload'
 *                 - type: object
 *                   properties:
 *                     fileName:
 *                       type: string
 *                     fileSize:
 *                       type: integer
 *                       nullable: true
 *                     checksum:
 *                       type: string
 *                       nullable: true
 *                     checksumType:
 *                       type: string
 *                       nullable: true
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       403:
 *         description: The caller is not a member of the organization
 *       404:
 *         description: Organization or pending upload not found
 *       500:
 *         description: Internal server error
 */
const info = async (req, res) => {
  try {
    const resolved = await resolvePending(req, res);
    if (!resolved) {
      return undefined;
    }
    const { pending } = resolved;

    return res.send({
      ...pendingSummary(pending),
      fileName: pending.fileName,
      fileSize: pending.checksum ? Number(pending.size) : null,
      checksum: pending.checksum,
      checksumType: pending.checksumType,
      createdAt: pending.createdAt,
    });
  } catch (err) {
    log.error.error('Error retrieving pending upload info', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { info };
