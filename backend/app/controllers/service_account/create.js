import { randomBytes } from 'crypto';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { problem, refuse } from '../../utils/problem.js';
import { hashServiceAccountToken } from '../../utils/serviceAccountAuth.js';
import { ORG_ROLES, ROLE_RANK, holdsGlobalAdmin } from '../../utils/orgMembership.js';

const { service_account: ServiceAccount, user: User, UserOrg } = db;

/**
 * The roles a creator may give a service account: the organization roles up
 * to the creator's own in that organization, plus superadmin for a global
 * admin.
 * @param {{role: string}|null} membership - The creator's membership in the organization
 * @param {boolean} globalAdmin - Whether the creator holds ROLE_ADMIN
 * @returns {string[]} The assignable roles
 */
const assignableRoles = (membership, globalAdmin) => [
  ...ORG_ROLES.filter(role => membership && ROLE_RANK[role] <= ROLE_RANK[membership.role]),
  ...(globalAdmin ? ['superadmin'] : []),
];

/**
 * @swagger
 * /api/service-accounts:
 *   post:
 *     summary: Create a new service account
 *     description: >-
 *       Create a service account with an authentication token for automated
 *       access. The raw token is returned ONLY in this response — it is stored
 *       hashed and can never be retrieved again. The account acts only inside
 *       its organization at its role, capped at request time by the creator's
 *       current role there; a superadmin account, which only a global admin may
 *       create, acts as a global admin on every organization while its creator
 *       keeps ROLE_ADMIN.
 *     tags: [Service Accounts]
 *     security:
 *       - JwtAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ServiceAccountCreateRequest'
 *     responses:
 *       201:
 *         description: Service account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ServiceAccount'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: The caller is not a member of the organization
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the service account form, the expiry ceiling among them, or the role is above the creator's own (pointer /role, rule enum, params.enum the assignable roles)
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
export const create = async (req, res) => {
  try {
    const {
      description,
      expiration_days: expirationDays,
      organization_id: organizationId,
      role = 'member',
    } = req.body;
    const { userId } = req;

    const user = await User.findByPk(userId);
    const globalAdmin = await holdsGlobalAdmin(user);
    const membership = await UserOrg.findUserOrgRole(userId, organizationId);
    if (role !== 'superadmin' && !membership) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('serviceAccounts.membershipRequired'),
      });
    }

    const allowed = assignableRoles(membership, globalAdmin);
    if (!allowed.includes(role)) {
      return refuse(res, req, [
        { pointer: '/role', rule: 'enum', params: { enum: allowed.join(', ') } },
      ]);
    }

    const username = `${user.username}-${randomBytes(4).toString('hex')}`;
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

    const serviceAccount = await ServiceAccount.create({
      username,
      token: hashServiceAccountToken(rawToken),
      expiresAt,
      description,
      role,
      userId,
      organization_id: organizationId,
    });

    return res.status(201).send({
      id: serviceAccount.id,
      username: serviceAccount.username,
      description: serviceAccount.description,
      role: serviceAccount.role,
      expiresAt: serviceAccount.expiresAt,
      organization_id: serviceAccount.organization_id,
      createdAt: serviceAccount.createdAt,
      token: rawToken,
    });
  } catch (err) {
    log.error.error('Error creating service account:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
