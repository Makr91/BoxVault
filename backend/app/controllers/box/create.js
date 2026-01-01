// create.js
const fs = require('fs');
const { getSecureBoxPath } = require('../../utils/paths');
const db = require('../../models');

const Box = db.box;

/**
 * @swagger
 * /api/organization/{organization}/box:
 *   post:
 *     summary: Create a new box
 *     description: Create a new Vagrant box within an organization
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Box name
 *               description:
 *                 type: string
 *                 description: Box description
 *               published:
 *                 type: boolean
 *                 description: Whether the box is published
 *                 default: false
 *               isPublic:
 *                 type: boolean
 *                 description: Whether the box is publicly accessible
 *                 default: false
 *     responses:
 *       200:
 *         description: Box created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Box'
 *       400:
 *         description: Bad request - name cannot be empty
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
exports.create = async (req, res) => {
  const { organization } = req.params;
  const { name, description, published, isPublic, githubRepo, workflowFile, cicdUrl } = req.body;

  if (!req.body.name) {
    return res.status(400).send({
      message: 'Name cannot be empty!',
    });
  }

  const newFilePath = getSecureBoxPath(organization, name);

  // Create the new directory if it doesn't exist
  if (!fs.existsSync(newFilePath)) {
    fs.mkdirSync(newFilePath, { recursive: true });
  }

  // Create a Box
  const box = {
    name: req.body.name,
    description,
    published: published || false,
    isPublic: isPublic || false,
    userId: req.userId,
    githubRepo: githubRepo || null,
    workflowFile: workflowFile || null,
    cicdUrl: cicdUrl || null,
  };

  // Save Box in the database
  try {
    const data = await Box.create(box);
    return res.send(data);
  } catch (err) {
    return res.status(500).send({
      message: err.message || 'Some error occurred while creating the Box.',
    });
  }
};
