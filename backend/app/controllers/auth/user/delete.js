// delete.js
const db = require('../../../models');

const User = db.user;

/**
 * @swagger
 * /api/users/{userId}:
 *   delete:
 *     summary: Delete a user
 *     description: Remove a user from the system
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to delete
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
 *                   example: "User was deleted successfully!"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Could not delete User with id=1"
 */
exports.deleteUser = (req, res) => {
  const { userId } = req.params;

  User.destroy({
    where: { id: userId },
  })
    .then(num => {
      if (num === 1) {
        res.send({ message: 'User was deleted successfully!' });
      } else {
        res.send({ message: `Cannot delete User with id=${userId}. Maybe User was not found!` });
      }
    })
    .catch(() => {
      res.status(500).send({
        message: `Could not delete User with id=${userId}`,
      });
    });
};
