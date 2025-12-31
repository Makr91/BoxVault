// update.js
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');
const db = require('../../models');

const Organization = db.organization;
const Users = db.user;
const Box = db.box;

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load App configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/organization/{organization}/box/{name}:
 *   put:
 *     summary: Update a box
 *     description: Update box information including name, description, and visibility settings
 *     tags: [Boxes]
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
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Current box name
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New box name
 *               description:
 *                 type: string
 *                 description: Box description
 *               published:
 *                 type: boolean
 *                 description: Whether the box is published
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the box is publicly accessible
 *     responses:
 *       200:
 *         description: Box updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Box'
 *       404:
 *         description: Box or organization not found
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
exports.update = async (req, res) => {
  const { organization, name } = req.params;
  const {
    name: updatedName,
    description,
    published,
    isPublic,
    githubRepo,
    workflowFile,
    cicdUrl,
  } = req.body;
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, name);
  const newFilePath = path.join(
    appConfig.boxvault.box_storage_directory.value,
    organization,
    updatedName || name
  );

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
      include: [
        {
          model: Users,
          as: 'users',
          include: [
            {
              model: Box,
              as: 'box',
              where: { name },
            },
          ],
        },
      ],
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`,
      });
    }

    const box = organizationData.users.flatMap(u => u.box).find(b => b.name === name);

    if (!box) {
      return res.status(404).send({
        message: `Box not found with name: ${name} in organization=${organization}.`,
      });
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Rename the directory if necessary
    if (oldFilePath !== newFilePath) {
      fs.mkdirSync(oldFilePath, { recursive: true });
      fs.mkdirSync(newFilePath, { recursive: true });
      fs.renameSync(oldFilePath, newFilePath);

      // Clean up the old directory if it still exists
      if (fs.existsSync(oldFilePath)) {
        fs.rmdirSync(oldFilePath, { recursive: true });
      }
    }

    const updatedBox = await box.update({
      name: updatedName || name,
      description: description !== undefined ? description : box.description,
      published: published !== undefined ? published : box.published,
      isPublic: isPublic !== undefined ? isPublic : box.isPublic,
      githubRepo: githubRepo !== undefined ? githubRepo : box.githubRepo,
      workflowFile: workflowFile !== undefined ? workflowFile : box.workflowFile,
      cicdUrl: cicdUrl !== undefined ? cicdUrl : box.cicdUrl,
    });

    return res.send(updatedBox);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while updating the Box.',
    });
  }
};
