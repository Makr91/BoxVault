/**
 * @swagger
 * components:
 *   schemas:
 *     Version:
 *       type: object
 *       required:
 *         - versionNumber
 *         - boxId
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the version
 *         versionNumber:
 *           type: string
 *           description: The version number (e.g., 1.0.0)
 *         description:
 *           type: string
 *           description: Description of the version
 *         boxId:
 *           type: integer
 *           description: ID of the box this version belongs to
 *         releaseNotes:
 *           type: string
 *           nullable: true
 *           description: Version release notes (markdown)
 *         deprecated:
 *           type: boolean
 *           description: Whether this version is deprecated
 *         deprecationReason:
 *           type: string
 *           nullable: true
 *           description: Why this version is deprecated
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Version creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Version last update timestamp
 *       example:
 *         id: 1
 *         versionNumber: "1.0.0"
 *         description: "Initial release"
 *         boxId: 1
 *         releaseNotes: "First stable build"
 *         deprecated: false
 *         deprecationReason: null
 *         createdAt: "2023-01-01T00:00:00.000Z"
 *         updatedAt: "2023-01-01T00:00:00.000Z"
 *
 *     VersionWithProviders:
 *       allOf:
 *         - $ref: '#/components/schemas/Version'
 *         - type: object
 *           properties:
 *             providers:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   architectures:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         name:
 *                           type: string
 *                         files:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               filename:
 *                                 type: string
 *                               size:
 *                                 type: integer
 *
 *     CreateVersionRequest:
 *       type: object
 *       required:
 *         - version_number
 *       properties:
 *         version_number:
 *           type: string
 *           description: The version number (the identifier pattern of /api/rules, unique in the box)
 *         description:
 *           type: string
 *           description: Description of the version
 *       example:
 *         version_number: "1.0.0"
 *         description: "Initial release"
 *
 *     UpdateVersionRequest:
 *       type: object
 *       properties:
 *         version_number:
 *           type: string
 *           description: The new version number (the identifier pattern of /api/rules, unique in the box)
 *         description:
 *           type: string
 *           description: Updated description of the version
 *         release_notes:
 *           type: string
 *           nullable: true
 *           description: Version release notes (absent = unchanged)
 *         deprecated:
 *           type: boolean
 *           description: Whether the version is deprecated. Setting true requires a non-empty deprecation_reason in this request.
 *         deprecation_reason:
 *           type: string
 *           maxLength: 512
 *           nullable: true
 *           description: Why the version is deprecated (absent = unchanged)
 *       example:
 *         version_number: "1.0.1"
 *         description: "Bug fixes and improvements"
 *         release_notes: "Fixed the resize race on first boot"
 *         deprecated: false
 */

// create.js
import { log } from '../../utils/Logger.js';
import { conflict, problem } from '../../utils/problem.js';
import db from '../../models/index.js';
import { canWriteBox, resolveOrgMembership } from '../../utils/orgMembership.js';
import { notifyVersionCreated } from './notifications.js';
const { versions: Version } = db;

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version:
 *   post:
 *     summary: Create a new version for a box
 *     description: The box owner, or an admin or owner of the organization, may create a version; a service account acts inside its own organization at its effective role.
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
 *       403:
 *         description: The caller may not write the box
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Organization or box not found
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
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
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const create = async (req, res) => {
  const { description, version_number: versionNumber } = req.body;

  try {
    // Organization and Box are already verified and attached by attachBox middleware
    const { organizationData, boxData: box } = req;

    // Check if user owns the box OR has admin/owner role
    const membership = await resolveOrgMembership(req, organizationData.id);
    const canCreate = canWriteBox(req, box, membership);

    if (!canCreate) {
      return problem(res, req, {
        status: 403,
        type: 'forbidden',
        title: req.__('versions.create.permissionDenied'),
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
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('versions.create.error'),
    });
  }
};
