// create.js
import { log } from '../../utils/Logger.js';
import { conflict, problem } from '../../utils/problem.js';
import db from '../../models/index.js';
import { generateOrgCode } from '../../utils/identity.js';
import { isReservedSegment } from '../../utils/reservedSegments.js';
const { organization: Organization, UserOrg } = db;

/**
 * @swagger
 * /api/organization:
 *   post:
 *     summary: Create a new organization
 *     description: Create a new organization with the specified name and description
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - organization
 *             properties:
 *               organization:
 *                 type: string
 *                 description: Organization name (the slug pattern of /api/rules, unique)
 *               description:
 *                 type: string
 *                 description: Organization description
 *     responses:
 *       201:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Organization'
 *       403:
 *         description: New organizations are switched off (auth.local.local_allow_new_organizations) and the caller is not a global admin
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       409:
 *         description: An organization with that name already exists, or the name is a reserved path segment
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       422:
 *         description: A value breaks a rule of the organization form
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
// Create and Save a new Organization
export const create = async (req, res) => {
  // Save Organization in the database
  try {
    if (isReservedSegment(req.body.organization)) {
      return conflict(res, req, '/organization', 'global');
    }

    const existingOrganization = await Organization.findOne({
      where: { name: req.body.organization },
    });
    if (existingOrganization) {
      return conflict(res, req, '/organization', 'global');
    }

    // Create a Organization
    const organization = {
      name: req.body.organization,
      org_code: await generateOrgCode(db),
      description: req.body.description,
      details: '',
    };

    const data = await Organization.create(organization);

    // The creator becomes the organization's owner; their primary org is unchanged
    await UserOrg.create({
      user_id: req.userId,
      organization_id: data.id,
      role: 'owner',
      is_primary: false,
    });

    return res.status(201).send(data);
  } catch (err) {
    log.error.error('Error creating organization:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('organizations.createError'),
    });
  }
};
