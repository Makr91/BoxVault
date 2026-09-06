// create.js
import { log } from '../../utils/Logger.js';
import { conflict } from '../../utils/problem.js';
import db from '../../models/index.js';
import { notifyVersionCreated } from './notifications.js';
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
 *       201:
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
 *       409:
 *         description: A version with that number already exists for the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the version form
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
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
  const { description, version_number: versionNumber } = req.body;

  try {
    // Organization and Box are already verified and attached by attachBox middleware
    const { organizationData, boxData: box } = req;

    // Check if user owns the box OR has admin/owner role
    const membership = await UserOrg.findUserOrgRole(req.userId, organizationData.id);
    const isOwner = box.userId === req.userId;
    const canCreate = isOwner || (membership && ['admin', 'owner'].includes(membership.role));

    if (!canCreate) {
      return res.status(403).send({
        message: req.__('versions.create.permissionDenied'),
      });
    }

    const existingVersion = await Version.findOne({
      where: { versionNumber, boxId: box.id },
    });
    if (existingVersion) {
      return conflict(res, req, '/version_number', box.name);
    }

    // Create the version
    const version = await Version.create({
      versionNumber,
      description,
      boxId: box.id,
    });

    // Fan out to the org's notification hub (published boxes in externally
    // managed orgs only). Fire-and-forget — never blocks or fails the request.
    if (box.published) {
      notifyVersionCreated(organizationData, box.name, versionNumber);
    }

    return res.status(201).send(version);
  } catch (err) {
    log.error.error('Error creating version:', err);
    return res.status(500).send({
      message: req.__('versions.create.error'),
    });
  }
};
