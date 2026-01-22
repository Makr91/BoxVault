// create.js
import db from '../../models/index.js';
const { versions: Version, UserOrg } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version:
 *   post:
 *     summary: Create a new version for a box
 *     tags: [Versions]
 *     security:
 *       - bearerAuth: []
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateVersionRequest'
 *     responses:
 *       200:
 *         description: Version created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Version'
 *       404:
 *         description: Organization or box not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization not found with name: example-org."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while creating the Version."
 */
export const create = async (req, res) => {
  const { description } = req.body;
  const versionNumber = req.body.versionNumber || req.body.version;

  try {
    // Organization and Box are already verified and attached by verifyVersion middleware
    const { organizationData, boxData: box } = req;

    // Check if user owns the box OR has moderator/admin role
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canCreate = isOwner || (membership && ['moderator', 'admin'].includes(membership.role));

    if (!canCreate) {
      return res.status(403).send({
        message: req.__('versions.create.permissionDenied'),
      });
    }

    // Create the version
    const version = await Version.create({
      versionNumber,
      description,
      boxId: box.id,
    });

    return res.status(201).send(version);
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('versions.create.error'),
    });
  }
};
