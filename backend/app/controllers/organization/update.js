// update.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { createHash } from 'crypto';
import db from '../../models/index.js';
const { organization: Organization } = db;

const generateEmailHash = email =>
  createHash('sha256').update(email.toLowerCase().trim()).digest('hex');

/**
 * @swagger
 * /api/organization/{organizationName}:
 *   put:
 *     summary: Update an organization
 *     description: Update organization information including name, description, email, and website
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Current organization name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               organization:
 *                 type: string
 *                 description: New organization name
 *               description:
 *                 type: string
 *                 description: Organization description
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Organization email
 *               website:
 *                 type: string
 *                 format: uri
 *                 description: Organization website URL
 *     responses:
 *       200:
 *         description: Organization updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization updated successfully."
 *                 organization:
 *                   $ref: '#/components/schemas/Organization'
 *       404:
 *         description: Organization not found
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
// Update the 'update' function
export const update = async (req, res) => {
  const { organization: organizationName } = req.params;
  const { description } = req.body;
  let { organization, email, org_code } = req.body;

  // Trim inputs to prevent whitespace issues
  if (organization) {
    organization = organization.trim();
  }
  if (email) {
    email = email.trim();
  }
  if (org_code) {
    org_code = org_code.trim();
  }
  const oldFilePath = getSecureBoxPath(organizationName);
  const newFilePath = getSecureBoxPath(organization || organizationName);

  try {
    const org = await Organization.findOne({
      where: { name: organizationName },
    });

    // Handle directory operations only if directories actually exist and names are different
    try {
      if (fs.existsSync(oldFilePath) && oldFilePath !== newFilePath) {
        // Create new directory structure if needed
        if (!fs.existsSync(newFilePath)) {
          fs.mkdirSync(newFilePath, { recursive: true });
        }

        // Move contents from old to new directory
        fs.renameSync(oldFilePath, newFilePath);

        // Clean up the old directory if it still exists
        if (fs.existsSync(oldFilePath)) {
          fs.rmSync(oldFilePath, { recursive: true, force: true });
        }
      }
      // If no directories exist, that's fine - they'll be created when boxes are uploaded
    } catch (fileErr) {
      log.error.error('Directory operation failed:', fileErr);
      // Continue with database update even if file operations fail
    }

    // Validate org_code format if provided
    if (org_code !== undefined && org_code !== null && org_code !== '') {
      if (!/^[0-9A-F]{6}$/.test(org_code)) {
        return res.status(400).send({
          message: req.__('organizations.invalidOrgCode'),
        });
      }

      // Check uniqueness if changing org_code
      if (org_code !== org.org_code) {
        const existingOrg = await Organization.findOne({
          where: { org_code },
        });
        if (existingOrg) {
          return res.status(400).send({
            message: req.__('organizations.orgCodeInUse', { org_code }),
          });
        }
      }
    }

    // Generate email hash if email is provided
    let emailHash = null;
    if (email) {
      emailHash = generateEmailHash(email);
    }

    await org.update({
      name: organization !== undefined ? organization : org.name,
      description: description !== undefined ? description : org.description,
      email: email !== undefined ? email : org.email,
      emailHash: emailHash || org.emailHash,
      org_code: org_code !== undefined ? org_code : org.org_code,
    });

    // Reload to ensure persistence and get fresh data
    await org.reload();

    return res.status(200).send({
      message: req.__('organizations.updated'),
      organization: org,
    });
  } catch (err) {
    return res.status(500).send({
      message: err.message || req.__('organizations.updateError'),
    });
  }
};
