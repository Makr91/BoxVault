// findone.js
import jwt from 'jsonwebtoken';
const { verify } = jwt;
import { loadConfig } from '../../utils/config-loader.js';
import db from '../../models/index.js';
const { versions: Version, UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}:
 *   get:
 *     summary: Get a specific version of a box
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
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized!"
 *       403:
 *         description: Forbidden - unauthorized access to private box
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access to version."
 *       404:
 *         description: Organization, box, or version not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Version not found for box example-box in organization example-org."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while retrieving the Version."
 */
export const findOne = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const authConfig = loadConfig('auth');
  const token = req.headers['x-access-token'];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = verify(token, authConfig.auth.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch {
      return res.status(401).send({ message: 'Unauthorized!' });
    }
  }

  try {
    // Organization and Box are already verified and attached by verifyVersion middleware
    const { organizationData, boxData: box } = req;

    const version = await Version.findOne({
      where: { versionNumber, boxId: box.id },
    });
    if (!version) {
      return res.status(404).send({
        message: `Version not found for box ${boxId} in organization ${organization}.`,
      });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      return res.send(version);
    }

    // If the box is private, check if the user is member of the organization
    if (!userId) {
      return res.status(403).send({ message: 'Unauthorized access to version.' });
    }

    const membership = await UserOrg.findUserOrgRole(userId, organizationData.id);
    if (!membership) {
      return res.status(403).send({ message: 'Unauthorized access to version.' });
    }

    // User is member, allow access
    return res.send(version);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while retrieving the Version.',
    });
  }
};
