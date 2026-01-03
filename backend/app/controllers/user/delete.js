// delete.js
const db = require('../../models');

const User = db.user;

/**
 * @swagger
 * /api/users/{userId}:
 *   delete:
 *     summary: Delete a user completely from BoxVault
 *     description: Permanently delete a user and all their data from the entire system (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID to delete
 *         example: 1
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "User deleted successfully."
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exports.delete = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByPk(userId);

    if (!user) {
      return res.status(404).send({
        message: req.__('users.userNotFound'),
      });
    }

    await user.destroy();
    return res.status(200).send({ message: req.__('users.userDeleted') });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('errors.operationFailed'),
    });
  }
};
