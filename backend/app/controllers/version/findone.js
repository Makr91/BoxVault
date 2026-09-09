// findone.js
import jwt from 'jsonwebtoken';
const { verify } = jwt;
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { resolveOrgMembership } from '../../utils/orgMembership.js';
import { problem } from '../../utils/problem.js';
import db from '../../models/index.js';
const { versions: Version } = db;

const unauthorized = (req, res) =>
  problem(res, req, { status: 403, type: 'forbidden', title: req.__('versions.unauthorized') });

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}:
 *   get:
 *     summary: Get a specific version of a box
 *     description: A private box needs membership of its organization; a service account is a member of its own organization only.
 *     tags: [Versions]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name/ID
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: JWT access token (required for private boxes)
 *     responses:
 *       200:
 *         description: Version retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Version'
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       403:
 *         description: Forbidden - unauthorized access to private box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization, box, or version not found
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
export const findOne = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const authConfig = loadConfig('auth');
  const token = req.headers['x-access-token'];
  let userId = null;
  let caller = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = verify(token, authConfig.auth.jwt.jwt_secret);
      userId = decoded.id;
      caller = {
        userId,
        isServiceAccount: Boolean(decoded.isServiceAccount),
        serviceAccountId: decoded.serviceAccountId,
      };
    } catch {
      return problem(res, req, {
        status: 401,
        type: 'authentication',
        title: req.__('auth.unauthorized'),
      });
    }
  }

  try {
    // Organization and Box are already verified and attached by verifyVersion middleware
    const { organizationData, boxData: box } = req;

    const version = await Version.findOne({
      where: { versionNumber, boxId: box.id },
    });
    if (!version) {
      return problem(res, req, {
        status: 404,
        type: 'not-found',
        title: `Version not found for box ${boxId} in organization ${organization}.`,
      });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      return res.send(version);
    }

    // If the box is private, check if the user is member of the organization
    if (!userId) {
      return unauthorized(req, res);
    }

    const membership = await resolveOrgMembership(caller, organizationData.id);
    if (!membership) {
      return unauthorized(req, res);
    }

    // User is member, allow access
    return res.send(version);
  } catch (err) {
    log.error.error('Error retrieving version:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
