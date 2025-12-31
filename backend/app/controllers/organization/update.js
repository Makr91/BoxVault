// update.js
const fs = require('fs');
const path = require('path');

const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const crypto = require('crypto');
const db = require('../../models');

const Organization = db.organization;

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load App configuration: ${e.message}`);
}

const generateEmailHash = email =>
  crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');

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
exports.update = async (req, res) => {
  const { organizationName } = req.params;
  const { organization, description, email, website } = req.body;
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organizationName);
  const newFilePath = path.join(
    appConfig.boxvault.box_storage_directory.value,
    organization || organizationName
  );

  try {
    const org = await Organization.findOne({
      where: { name: organizationName },
    });

    if (!org) {
      return res.status(404).send({
        message: 'Organization not found.',
      });
    }

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
          fs.rmdirSync(oldFilePath, { recursive: true });
        }
      }
      // If no directories exist, that's fine - they'll be created when boxes are uploaded
    } catch (fileErr) {
      log.error.error('Directory operation failed:', fileErr);
      // Continue with database update even if file operations fail
    }

    // Generate email hash if email is provided
    let emailHash = null;
    if (email) {
      emailHash = generateEmailHash(email);
    }

    await org.update({
      name: organization || org.name,
      description: description || org.description,
      email: email || org.email,
      emailHash: emailHash || org.emailHash,
      website: website || org.website,
    });

    return res.status(200).send({
      message: 'Organization updated successfully.',
      organization: org,
    });
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while updating the organization.',
    });
  }
};
