import { log } from '../../../utils/Logger.js';
import db from '../../../models/index.js';
import { problem, refuse } from '../../../utils/problem.js';
const { user: User, role: Role } = db;

const roleNames = roles => roles.map(role => role.name);

const notFound = (req, res) =>
  problem(res, req, { status: 404, type: 'not-found', title: req.__('users.userNotFound') });

const countAdmins = () =>
  User.count({
    include: [{ model: Role, as: 'roles', where: { name: 'admin' }, through: { attributes: [] } }],
  });

/**
 * @swagger
 * /api/roles:
 *   get:
 *     summary: List the global roles
 *     description: The names of every global role an account may hold, in table order (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The role names
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["user", "admin"]
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const listRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({ order: [['id', 'ASC']] });
    return res.status(200).send({ roles: roleNames(roles) });
  } catch (err) {
    log.error.error('Error listing roles:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.roles.error'),
    });
  }
};

/**
 * @swagger
 * /api/users/{userId}/roles:
 *   get:
 *     summary: Read a user's global roles
 *     description: The global role names one account holds (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: The user's role names
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: string
 *       404:
 *         description: User not found
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
export const getUserRoles = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return notFound(req, res);
    }
    const roles = await user.getRoles({ order: [['id', 'ASC']] });
    return res.status(200).send({ roles: roleNames(roles) });
  } catch (err) {
    log.error.error('Error reading user roles:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.roles.error'),
    });
  }
};

/**
 * @swagger
 * /api/users/{userId}/roles:
 *   put:
 *     summary: Write a user's global roles
 *     description: Replace the whole set of global roles one account holds (Admin only). The last administrator keeps the admin role.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roles]
 *             properties:
 *               roles:
 *                 type: array
 *                 minItems: 1
 *                 uniqueItems: true
 *                 items:
 *                   type: string
 *                   enum: [user, admin]
 *     responses:
 *       200:
 *         description: Roles written
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 roles:
 *                   type: array
 *                   items:
 *                     type: string
 *       404:
 *         description: User not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A role name is unknown, or the set would leave BoxVault without an administrator
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
export const setUserRoles = async (req, res) => {
  const { userId } = req.params;
  const wanted = [...new Set(req.body.roles)];
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return notFound(req, res);
    }

    const known = await Role.findAll({ order: [['id', 'ASC']] });
    const knownNames = roleNames(known);
    const unknown = wanted
      .map((name, index) => ({ name, index }))
      .filter(entry => !knownNames.includes(entry.name));
    if (unknown.length) {
      return refuse(
        res,
        req,
        unknown.map(entry => ({
          pointer: `/roles/${entry.index}`,
          rule: 'enum',
          params: { enum: knownNames.join(', ') },
        }))
      );
    }

    const current = roleNames(await user.getRoles());
    if (current.includes('admin') && !wanted.includes('admin') && (await countAdmins()) <= 1) {
      return refuse(res, req, [
        { pointer: '/roles', rule: 'lastAdmin', detail: req.__('users.lastAdmin') },
      ]);
    }

    await user.setRoles(known.filter(role => wanted.includes(role.name)));
    const roles = await user.getRoles({ order: [['id', 'ASC']] });
    return res.status(200).send({ message: req.__('users.rolesUpdated'), roles: roleNames(roles) });
  } catch (err) {
    log.error.error('Error writing user roles:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('users.roles.error'),
    });
  }
};
