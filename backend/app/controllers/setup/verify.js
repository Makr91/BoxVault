// verify.js
import fs from 'fs';
import { timingSafeEqual } from 'crypto';
import { getSetupTokenPath } from '../../utils/config-loader.js';
import { problem } from '../../utils/problem.js';
import { setAuthorizedSetupToken } from './helpers.js';

const forbidden = (req, res, key) =>
  problem(res, req, { status: 403, type: 'forbidden', title: req.__(key) });

/**
 * @swagger
 * /api/setup/verify-token:
 *   post:
 *     summary: Verify setup token and get authorization
 *     description: Verify the initial setup token and receive an authorized token for subsequent setup operations
 *     tags: [Setup]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SetupTokenRequest'
 *     responses:
 *       200:
 *         description: Setup token verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SetupTokenResponse'
 *       403:
 *         description: Setup not allowed or invalid token
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
export const verifySetupToken = (req, res) => {
  const { token } = req.body;
  const setupTokenPath = getSetupTokenPath();

  if (!fs.existsSync(setupTokenPath)) {
    return forbidden(req, res, 'setup.notAllowed');
  }

  const storedToken = fs.readFileSync(setupTokenPath, 'utf8').trim();
  const tokenBuffer = Buffer.from(token || '', 'utf8');
  const storedBuffer = Buffer.from(storedToken, 'utf8');
  if (tokenBuffer.length !== storedBuffer.length || !timingSafeEqual(tokenBuffer, storedBuffer)) {
    return forbidden(req, res, 'setup.invalidToken');
  }

  // Generate an authorized token (for simplicity, we'll use the same token)
  setAuthorizedSetupToken(storedToken);
  return res.json({ authorizedSetupToken: storedToken }); // Return the token in the response body
};
