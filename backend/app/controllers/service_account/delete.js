import db from '../../models/index.js';
const { service_account: ServiceAccount } = db;

/**
 * @swagger
 * /api/service-accounts/{id}:
 *   delete:
 *     summary: Delete a service account
 *     description: Delete a service account by ID (only the owner can delete their service accounts)
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
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Service account not found or not owned by user
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const _delete = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req;

    const deleted = await ServiceAccount.destroy({ where: { id, userId } });

    if (deleted) {
      return res.send({ message: 'Service account deleted successfully.' });
    }
    return res.status(404).send({ message: 'Service account not found.' });
  } catch (err) {
    return res.status(500).send({ message: err.message });
  }
};
export { _delete as delete };
