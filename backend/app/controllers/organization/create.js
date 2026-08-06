// create.js
import { log } from '../../utils/Logger.js';
import db from '../../models/index.js';
import { generateOrgCode } from '../../utils/identity.js';
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
 *                 description: Organization name
 *               description:
 *                 type: string
 *                 description: Organization description
 *     responses:
 *       200:
 *         description: Organization created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Organization'
 *       400:
 *         description: Bad request - organization name cannot be empty
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// Create and Save a new Organization
export const create = async (req, res) => {
  // Save Organization in the database
  try {
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
    return res.status(500).send({
      message: req.__('organizations.createError'),
    });
  }
};
