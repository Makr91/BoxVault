// verify.js
const fs = require('fs');
const { getSetupTokenPath } = require('../../utils/config-loader');
const { setAuthorizedSetupToken } = require('./helpers');

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
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "Invalid setup token"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.verifySetupToken = (req, res) => {
  const { token } = req.body;
  const setupTokenPath = getSetupTokenPath();

  if (!fs.existsSync(setupTokenPath)) {
    return res.status(403).send('Setup is not allowed');
  }

  const storedToken = fs.readFileSync(setupTokenPath, 'utf8').trim();
  if (token !== storedToken) {
    return res.status(403).send('Invalid setup token');
  }

  // Generate an authorized token (for simplicity, we'll use the same token)
  setAuthorizedSetupToken(storedToken);
  return res.json({ authorizedSetupToken: storedToken }); // Return the token in the response body
};
