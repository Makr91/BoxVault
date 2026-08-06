import { randomBytes } from 'crypto';
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { loadConfig } from '../../utils/config-loader.js';
import { hashServiceAccountToken } from '../../utils/serviceAccountAuth.js';

const { service_account: ServiceAccount, user: User, UserOrg } = db;

/**
 * @swagger
 * /api/service-accounts:
 *   post:
 *     summary: Create a new service account
 *     description: >-
 *       Create a service account with an authentication token for automated
 *       access. The raw token is returned ONLY in this response — it is stored
 *       hashed and can never be retrieved again.
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
 *       400:
 *         description: Invalid request data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
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
export const create = async (req, res) => {
  try {
    const authConfig = loadConfig('auth');
    const { description, expirationDays, organizationId } = req.body;
    const { userId } = req;

    if (!organizationId) {
      return res.status(400).send({ message: 'Organization ID is required!' });
    }

    // Validate expiration days against configured maximum
    const maxExpiryDays = authConfig.auth?.jwt?.service_account_max_expiry_days?.value || 365;
    if (expirationDays > maxExpiryDays) {
      return res.status(400).send({
        message: `Service account expiration cannot exceed ${maxExpiryDays} days.`,
      });
    }

    const userRole = await UserOrg.findUserOrgRole(userId, organizationId);
    if (!userRole) {
      return res.status(403).send({
        message: 'You must be a member of this organization to create service accounts!',
      });
    }

    const user = await User.findByPk(userId);
    const username = `${user.username}-${randomBytes(4).toString('hex')}`;
    // The raw token leaves the server exactly once (in this response); only
    // its sha256 hash is persisted.
    const rawToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expirationDays * 24 * 60 * 60 * 1000);

    const serviceAccount = await ServiceAccount.create({
      username,
      token: hashServiceAccountToken(rawToken),
      expiresAt,
      description,
      userId,
      organization_id: organizationId,
    });

    return res.status(201).send({
      id: serviceAccount.id,
      username: serviceAccount.username,
      description: serviceAccount.description,
      expiresAt: serviceAccount.expiresAt,
      organization_id: serviceAccount.organization_id,
      createdAt: serviceAccount.createdAt,
      token: rawToken,
    });
  } catch (err) {
    log.error.error('Error creating service account:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
