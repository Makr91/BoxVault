import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { service_account: ServiceAccount, user: User, UserOrg } = db;

/**
 * Whether the caller may revoke the service account: its creator, a global
 * admin, or an owner or admin of the account's organization.
 * @param {Object} serviceAccount - Service account instance
 * @param {number} userId - The caller's user id
 * @returns {Promise<boolean>}
 */
const canRevoke = async (serviceAccount, userId) => {
  if (serviceAccount.userId === userId) {
    return true;
  }
  const user = await User.findByPk(userId);
  const roles = await user.getRoles();
  if (roles.some(role => role.name === 'admin')) {
    return true;
  }
  return UserOrg.hasRole(userId, serviceAccount.organization_id, ['admin', 'owner']);
};

/**
 * @swagger
 * /api/service-accounts/{id}:
 *   delete:
 *     summary: Delete a service account
 *     description: Revoke a service account by ID. Its creator, an owner or admin of its organization, and a global admin may revoke it.
 *     tags: [Service Accounts]
 *     security:
 *       - JwtAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Service account ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Service account deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Service account not found, or the caller may not revoke it
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
const _delete = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req;

    const serviceAccount = await ServiceAccount.findByPk(id);
    if (!serviceAccount || !(await canRevoke(serviceAccount, userId))) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: req.__('serviceAccounts.notFound'),
      });
    }

    await ServiceAccount.destroy({ where: { id: serviceAccount.id } });
    return res.send({ message: req.__('serviceAccounts.deleted') });
  } catch (err) {
    log.error.error('Error deleting service account:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
export { _delete as delete };
