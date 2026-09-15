import { log } from '../../../utils/Logger.js';
import { canWritePendingUpload } from '../../../utils/orgMembership.js';
import { problem } from '../../../utils/problem.js';
import { safeRmdirSync } from '../../../utils/fsHelper.js';
import { getPendingPath } from '../helpers.js';
import { resolvePending } from './resolve.js';

/**
 * @swagger
 * /api/organization/{organization}/download/pending/{id}:
 *   delete:
 *     summary: Discard a pending upload
 *     description: Remove the pending upload's bytes and its row. The member who uploaded it, or an admin or owner of the organization, may discard it.
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
 *       204:
 *         description: Pending upload discarded
 *       403:
 *         description: The caller neither uploaded it nor administers the organization
 *       404:
 *         description: Organization or pending upload not found
 *       500:
 *         description: Internal server error
 */
const remove = async (req, res) => {
  try {
    const resolved = await resolvePending(req, res);
    if (!resolved) {
      return undefined;
    }
    const { organization, membership, pending } = resolved;

    if (!canWritePendingUpload(req, pending, membership)) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('downloads.permissionDenied'),
      });
    }

    safeRmdirSync(getPendingPath(organization.name, pending.id));
    await pending.destroy();

    return res.status(204).send();
  } catch (err) {
    log.error.error('Error discarding pending upload', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};

export { remove };
