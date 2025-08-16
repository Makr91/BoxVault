const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../utils/config-loader');
const jwt = require("jsonwebtoken");
const db = require("../models");
const crypto = require('crypto');
const User = db.user;
const Role = db.role;
const Box = db.box;
const Organization = db.organization; 
const Op = db.Sequelize.Op;
let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  console.error(`Failed to load auth configuration: ${e.message}`);
}

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  console.error(`Failed to load App configuration: ${e.message}`);
}

const generateEmailHash = (email) => {
  return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
};

/**
 * @swagger
 * /api/organizations-with-users:
 *   get:
 *     summary: Get all organizations with their users (Admin only)
 *     description: Retrieve all organizations including their users and user roles. Admin access required.
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations with users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OrganizationWithUsers'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
exports.getOrganizationsWithUsers = async (req, res) => {
  try {
    const organizations = await Organization.findAll({
      include: [
        {
          model: User,
          as: 'users',
          include: [
            {
              model: Role,
              as: 'roles',
              attributes: ['name'], 
            },
          ],
        },
      ],
    });
    res.status(200).send(organizations);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

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
exports.create = async (req, res) => {
    // Validate request
    if (!req.body.organization) {
      res.status(400).send({
        message: "Organization cannot be empty!"
      });
      return;
    }
  
    // Create a Organization
    const organization = {
      name: req.body.organization,
      description: req.body.description,
      details: ""
    };
  
    // Save Organization in the database
    Organization.create(organization)
      .then(data => {
        res.send(data);
      })
      .catch(err => {
        res.status(500).send({
          message:
            err.message || "Some error occurred while creating the Organization."
        });
      });
    };

/**
 * @swagger
 * /api/organizations-with-users:
 *   get:
 *     summary: Get all organizations with users and box counts
 *     description: Retrieve all organizations with their users, roles, and box counts. Box counts are filtered based on user access.
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of organizations with detailed user information
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Organization'
 *                   - type: object
 *                     properties:
 *                       users:
 *                         type: array
 *                         items:
 *                           allOf:
 *                             - $ref: '#/components/schemas/User'
 *                             - type: object
 *                               properties:
 *                                 totalBoxes:
 *                                   type: integer
 *                                   description: Number of boxes accessible to the requesting user
 *                       totalBoxes:
 *                         type: integer
 *                         description: Total number of boxes in the organization accessible to the requesting user
 *       401:
 *         description: Unauthorized - invalid token
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
exports.findAllWithUsers = async (req, res) => {
  const token = req.headers["x-access-token"];
  let userId = null;
  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
      userId = decoded.id;
      console.log("Decoded user ID:", userId);
    } catch (err) {
      console.error("JWT verification error:", err.message);
      return res.status(401).send({ message: "Unauthorized!!!!" });
    }
  }

  try {
    const organizations = await Organization.findAll({
      include: [
        {
          model: User,
          as: 'users',
          include: [
            {
              model: Role,
              as: 'roles',
              attributes: ['name'],
              through: { attributes: [] }
            },
            {
              model: Box,
              as: 'box',
              attributes: ['id']
            }
          ]
        }
      ]
    });

    const result = organizations.map(org => ({
      ...org.toJSON(),
      users: org.users.map(user => ({
        ...user.toJSON(),
        totalBoxes: user.box.filter(box => box.isPublic || (userId && user.id === userId)).length
      })),
      totalBoxes: org.users.reduce((acc, user) => acc + user.box.filter(box => box.isPublic || (userId && user.id === userId)).length, 0)
    }));

    res.status(200).send(result);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving organizations."
    });
  }
};

/**
 * @swagger
 * /api/organization/{organizationName}/users:
 *   get:
 *     summary: Get users in a specific organization
 *     description: Retrieve all users belonging to a specific organization with their roles and box counts
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: List of users in the organization
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     description: User ID
 *                   username:
 *                     type: string
 *                     description: Username
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: User email
 *                   verified:
 *                     type: boolean
 *                     description: Email verification status
 *                   suspended:
 *                     type: boolean
 *                     description: User suspension status
 *                   roles:
 *                     type: array
 *                     items:
 *                       type: string
 *                     description: User roles
 *                   totalBoxes:
 *                     type: integer
 *                     description: Number of boxes accessible to the requesting user
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
exports.findOneWithUsers = async (req, res) => {
  const { organizationName } = req.params;
  const userId = req.userId;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
      include: [
        {
          model: User,
          as: 'users',
          include: [
            {
              model: Role,
              as: 'roles',
              through: { attributes: [] },
            },
            {
              model: Box,
              as: 'box',
            },
          ],
        },
      ],
    });

    if (!organization) {
      return res.status(404).send({ message: "Organization not found." });
    }

    const users = organization.users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      verified: user.verified,
      suspended: user.suspended,
      roles: user.roles.map(role => role.name),
      totalBoxes: user.box.filter(box => box.isPublic || (userId && user.id === userId)).length
    }));

    res.status(200).send(users);
  } catch (err) {
    console.error("Error in findOneWithUsers:", err);
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving users."
    });
  }
};

/**
 * @swagger
 * /api/organization:
 *   get:
 *     summary: Get all organizations
 *     description: Retrieve all organizations with optional name filtering and box counts
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organization
 *         schema:
 *           type: string
 *         description: Filter organizations by name (partial match)
 *     responses:
 *       200:
 *         description: List of organizations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/Organization'
 *                   - type: object
 *                     properties:
 *                       totalBoxes:
 *                         type: integer
 *                         description: Total number of boxes accessible to the requesting user
 *       401:
 *         description: Unauthorized - invalid token
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
// Retrieve all Organizations from the database.
exports.findAll = async (req, res) => {
  const organization = req.query.organization;
  const token = req.headers["x-access-token"];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch (err) {
      return res.status(401).send({ message: "Unauthorized!" });
    }
  }

  try {
    const condition = organization ? { name: { [Op.like]: `%${organization}%` } } : null;
    const organizations = await Organization.findAll({ where: condition });

    const result = organizations.map(org => ({
      ...org.toJSON(),
      totalBoxes: org.users.reduce((acc, user) => acc + user.box.filter(box => box.isPublic || (userId && user.id === userId)).length, 0)
    }));

    res.status(200).send(result);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving organizations."
    });
  }
};

/**
 * @swagger
 * /api/organization/{organizationName}:
 *   get:
 *     summary: Get a specific organization
 *     description: Retrieve detailed information about a specific organization including box counts
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *     responses:
 *       200:
 *         description: Organization details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Organization'
 *                 - type: object
 *                   properties:
 *                     totalBoxes:
 *                       type: integer
 *                       description: Total number of boxes accessible to the requesting user
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
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
exports.findOne = async (req, res) => {
  const { organizationName } = req.params;
  const token = req.headers["x-access-token"];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch (err) {
      return res.status(401).send({ message: "Unauthorized!" });
    }
  }

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName },
      include: [{
        model: User,
        as: 'users',
        include: [{
          model: Box,
          as: 'box'
        }]
      }]
    });

    console.log("Organization found:", JSON.stringify(organization, null, 2));

    if (!organization) {
      return res.status(404).send({
        message: `Cannot find Organization with name=${organizationName}.`
      });
    }

    console.log("Org Detected!");

    let totalBoxes = 0;
    if (organization.users && Array.isArray(organization.users)) {
      totalBoxes = organization.users.reduce((acc, user) => {
        if (user.box && Array.isArray(user.box)) {
          return acc + user.box.filter(box => box.isPublic || (userId && user.id === userId)).length;
        }
        return acc;
      }, 0);
    }

    console.log("Total Boxes calculated:", totalBoxes);

    res.send({ ...organization.toJSON(), totalBoxes });
  } catch (err) {
    console.error("Error in findOne:", err);
    res.status(500).send({
      message: "Error retrieving Organization with name=" + organizationName
    });
  }
};

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
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization || organizationName);

  try {
    const org = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!org) {
      return res.status(404).send({
        message: "Organization not found."
      });
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(oldFilePath)) {
      fs.mkdirSync(oldFilePath, { recursive: true });
    }

    // Rename the directory if necessary
    if (oldFilePath !== newFilePath) {
      fs.renameSync(oldFilePath, newFilePath);

      // Clean up the old directory if it still exists
      if (fs.existsSync(oldFilePath)) {
        fs.rmdirSync(oldFilePath, { recursive: true });
      }
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
      website: website || org.website
    });

    res.status(200).send({
      message: "Organization updated successfully.",
      organization: org
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while updating the organization."
    });
  }
};
  
/**
 * @swagger
 * /api/organization/{organizationName}:
 *   delete:
 *     summary: Delete an organization
 *     description: Delete an organization and all its associated files and directories (Admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to delete
 *     responses:
 *       200:
 *         description: Organization deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization and its files deleted successfully."
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
// Delete a Organization with the specified id in the request
exports.delete = async (req, res) => {
  const { organizationName } = req.params;

  try {
    // Find the organization by name
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({
        message: "Organization not found."
      });
    }

    // Determine the directory path
    const dirPath = path.join(appConfig.boxvault.box_storage_directory.value, organizationName);

    // Delete the organization
    await organization.destroy();

    // Delete the directory
    if (fs.existsSync(dirPath)) {
      fs.rmdirSync(dirPath, { recursive: true });
    }

    res.status(200).send({
      message: "Organization and its files deleted successfully."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the organization."
    });
  }
};

/**
 * @swagger
 * /api/organization/{organizationName}/suspend:
 *   put:
 *     summary: Suspend an organization
 *     description: Suspend an organization (Admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to suspend
 *     responses:
 *       200:
 *         description: Organization suspended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization suspended successfully!"
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
exports.suspendOrganization = async (req, res) => {
  const { organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({ message: "Organization not found." });
    }

    organization.suspended = true;
    await organization.save();

    res.status(200).send({ message: "Organization suspended successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while suspending the organization." });
  }
};

/**
 * @swagger
 * /api/organization/{organizationName}/resume:
 *   put:
 *     summary: Resume a suspended organization
 *     description: Reactivate a suspended organization (Admin only)
 *     tags: [Organizations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organizationName
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name to resume
 *     responses:
 *       200:
 *         description: Organization resumed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization resumed successfully!"
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
exports.resumeOrganization = async (req, res) => {
  const { organizationName } = req.params;

  try {
    const organization = await Organization.findOne({
      where: { name: organizationName }
    });

    if (!organization) {
      return res.status(404).send({ message: "Organization not found." });
    }

    organization.suspended = false;
    await organization.save();

    res.status(200).send({ message: "Organization resumed successfully!" });
  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while resuming the organization." });
  }
};
