// update.js
import fs from 'fs';
import { getSecureBoxPath } from '../../utils/paths.js';
import { log } from '../../utils/Logger.js';
import { parseBoxContentFields } from './helpers.js';
import db from '../../models/index.js';
const { box: Box } = db;

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
 *               shortDescription:
 *                 type: string
 *                 maxLength: 255
 *                 nullable: true
 *                 description: Short one-line box description (absent = unchanged)
 *               readme:
 *                 type: string
 *                 nullable: true
 *                 description: Box README (markdown, absent = unchanged)
 *               metadata:
 *                 type: object
 *                 nullable: true
 *                 description: Structured box facts pushed by the build pipeline (whitelisted top-level keys only, unknown keys stripped silently, absent = unchanged)
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
export const update = async (req, res) => {
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
  const oldFilePath = getSecureBoxPath(organization, name);
  const newFilePath = getSecureBoxPath(organization, updatedName || name);

  const { error: contentError, fields: contentFields } = parseBoxContentFields(req.body);
  if (contentError) {
    return res.status(400).send({ message: contentError });
  }

  try {
    if (!req.organizationId) {
      return res.status(500).send({
        message: 'Organization context missing',
      });
    }

    const box = await Box.findOne({
      where: { name, organizationId: req.organizationId },
    });

    if (!box) {
      return res.status(404).send({
        message: req.__('boxes.boxNotFound'),
      });
    }

    // Check if user is owner OR has admin/owner role
    const isOwner = box.userId === req.userId;
    const canUpdate = isOwner || ['admin', 'owner'].includes(req.userOrgRole);

    if (!canUpdate) {
      return res.status(403).send({
        message: req.__('boxes.update.permissionDenied'),
      });
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Rename the directory if necessary
    if (oldFilePath !== newFilePath && fs.existsSync(oldFilePath)) {
      if (fs.existsSync(newFilePath)) {
        fs.rmSync(newFilePath, { recursive: true, force: true });
      }
      fs.renameSync(oldFilePath, newFilePath);
    }

    const updatedBox = await box.update({
      name: updatedName || name,
      description: description !== undefined ? description : box.description,
      published: published !== undefined ? published : box.published,
      isPublic: isPublic !== undefined ? isPublic : box.isPublic,
      githubRepo: githubRepo !== undefined ? githubRepo : box.githubRepo,
      workflowFile: workflowFile !== undefined ? workflowFile : box.workflowFile,
      cicdUrl: cicdUrl !== undefined ? cicdUrl : box.cicdUrl,
      // Content fields carry only the keys present in the body (absent = unchanged)
      ...contentFields,
    });

    return res.send(updatedBox);
  } catch (err) {
    log.error.error('Error updating box:', err);
    return res.status(500).send({
      message: req.__('boxes.update.error'),
    });
  }
};
