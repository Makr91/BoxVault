/**
 * @swagger
 * components:
 *   schemas:
 *     Provider:
 *       type: object
 *       required:
 *         - name
 *         - versionId
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the provider
 *         name:
 *           type: string
 *           description: The provider name (e.g., virtualbox, vmware)
 *         description:
 *           type: string
 *           description: Description of the provider
 *         versionId:
 *           type: integer
 *           description: ID of the version this provider belongs to
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Provider creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Provider last update timestamp
 *       example:
 *         id: 1
 *         name: "virtualbox"
 *         description: "VirtualBox provider"
 *         versionId: 1
 *         createdAt: "2023-01-01T00:00:00.000Z"
 *         updatedAt: "2023-01-01T00:00:00.000Z"
 *     
 *     CreateProviderRequest:
 *       type: object
 *       required:
 *         - name
 *       properties:
 *         name:
 *           type: string
 *           description: The provider name
 *         description:
 *           type: string
 *           description: Description of the provider
 *       example:
 *         name: "virtualbox"
 *         description: "VirtualBox provider"
 *     
 *     UpdateProviderRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: The new provider name
 *         description:
 *           type: string
 *           description: Updated description of the provider
 *       example:
 *         name: "virtualbox"
 *         description: "Updated VirtualBox provider"
 */

// provider.controller.js
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../utils/config-loader');
const jwt = require("jsonwebtoken");
const db = require("../models");
const Provider = db.providers;
const Version = db.versions;
const Architecture = db.architectures;

let authConfig;
try {
  authConfig = loadConfig('auth');
} catch (e) {
  log.error.error(`Failed to load auth configuration: ${e.message}`);
}

let appConfig;
try {
  appConfig = loadConfig('app');
} catch (e) {
  log.error.error(`Failed to load App configuration: ${e.message}`);
}

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}/providers:
 *   post:
 *     summary: Create a new provider for a version
 *     tags: [Providers]
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
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateProviderRequest'
 *     responses:
 *       200:
 *         description: Provider created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Provider'
 *       404:
 *         description: Organization, box, or version not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization not found with name: example-org."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while creating the Provider."
 */
exports.create = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const { name, description } = req.body;
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, name);

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: db.box,
          as: 'box',
          where: { name: boxId },
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber }
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({ message: `Organization not found with name: ${organization}.` });
    }

    // Extract the box and version from the organization data
    const box = organizationData.users.flatMap(user => user.box)
      .find(box => box.name === boxId);

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`
      });
    }

    // Create the provider
    const provider = await Provider.create({
      name,
      description,
      versionId: version.id
    });

    res.send(provider);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while creating the Provider."
    });
  }
};

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}/providers:
 *   get:
 *     summary: Get all providers for a version
 *     tags: [Providers]
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
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: JWT access token (required for private boxes)
 *     responses:
 *       200:
 *         description: List of providers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Provider'
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized!"
 *       403:
 *         description: Forbidden - unauthorized access to private box
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access to providers."
 *       404:
 *         description: Organization, box, or version not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Organization not found with name: example-org."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while retrieving providers."
 */
exports.findAllByVersion = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;
  const token = req.headers["x-access-token"];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch (err) {
      return res.status(401).send({ message: "Unauthorized!" });
    }
  }

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: db.box,
          as: 'box',
          where: { name: boxId },
          attributes: ['id', 'name', 'isPublic'], // Include isPublic attribute
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber }
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`
      });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      const providers = await Provider.findAll({ where: { versionId: version.id } });
      return res.send(providers);
    }

    // If the box is private, check if the user belongs to the organization
    if (!userId) {
      return res.status(403).send({ message: "Unauthorized access to providers." });
    }

    const user = organizationData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(403).send({ message: "Unauthorized access to providers." });
    }

    // If the user belongs to the organization, allow access
    const providers = await Provider.findAll({ where: { versionId: version.id } });
    return res.send(providers);

  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving providers." });
  }
};

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}/providers/{providerName}:
 *   get:
 *     summary: Get a specific provider by name
 *     description: Retrieve details of a specific provider within a box version. Access depends on box visibility and user authentication.
 *     tags: [Providers]
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: myorg
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name/ID
 *         example: ubuntu-server
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *         example: "1.0.0"
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name
 *         example: virtualbox
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: JWT access token (required for private boxes)
 *     responses:
 *       200:
 *         description: Provider retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Provider'
 *       401:
 *         description: Unauthorized - invalid token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized!"
 *       403:
 *         description: Forbidden - unauthorized access to private box
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized access to provider."
 *       404:
 *         description: Organization, box, version, or provider not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Provider virtualbox not found for version 1.0.0 in box ubuntu-server in organization myorg."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while retrieving the Provider."
 */
exports.findOne = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const token = req.headers["x-access-token"];
  let userId = null;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.auth.jwt.jwt_secret.value);
      userId = decoded.id;
    } catch (err) {
      return res.status(401).send({ message: "Unauthorized!" });
    }
  }

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: db.box,
          as: 'box',
          where: { name: boxId },
          attributes: ['id', 'name', 'isPublic'], // Include isPublic attribute
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber }
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version not found for box ${boxId} in organization ${organization}.`
      });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      const provider = await Provider.findOne({ where: { name: providerName, versionId: version.id } });
      if (!provider) {
        return res.status(404).send({
          message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId} in organization ${organization}.`
        });
      }
      return res.send(provider);
    }

    // If the box is private, check if the user belongs to the organization
    if (!userId) {
      return res.status(403).send({ message: "Unauthorized access to provider." });
    }

    const user = organizationData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(403).send({ message: "Unauthorized access to provider." });
    }

    // If the user belongs to the organization, allow access
    const provider = await Provider.findOne({ where: { name: providerName, versionId: version.id } });
    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId} in organization ${organization}.`
      });
    }
    return res.send(provider);

  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving the Provider." });
  }
};

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}/providers/{providerName}:
 *   put:
 *     summary: Update a provider by name
 *     description: Update a provider's properties including name and description. Also handles file system directory renaming when provider name changes.
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: myorg
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name/ID
 *         example: ubuntu-server
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *         example: "1.0.0"
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Current provider name to update
 *         example: virtualbox
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProviderRequest'
 *     responses:
 *       200:
 *         description: Provider updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Provider'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized!"
 *       404:
 *         description: Organization, box, version, or provider not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Provider virtualbox not found for version 1.0.0 in box ubuntu-server in organization myorg."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while updating the Provider."
 */
exports.update = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name, description } = req.body;
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName);
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, name);

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: db.box,
          as: 'box',
          where: { name: boxId },
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber }
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    // Extract the box and version from the organization data
    const box = organizationData.users.flatMap(user => user.box)
      .find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`
      });
    }

    // Create the new directory if it doesn't exist
    if (!fs.existsSync(newFilePath)) {
      fs.mkdirSync(newFilePath, { recursive: true });
    }

    // Rename the directory if necessary
    if (oldFilePath !== newFilePath) {
      fs.renameSync(oldFilePath, newFilePath);

      // Clean up the old directory if it still exists
      if (fs.existsSync(oldFilePath)) {
        fs.rmdirSync(oldFilePath, { recursive: true });
      }
    }

    const [updated] = await Provider.update(
      { name, description },
      { where: { name: providerName, versionId: version.id } }
    );

    if (updated) {
      const updatedProvider = await Provider.findOne({ where: { name: name, versionId: version.id } });
      return res.send(updatedProvider);
    }

    throw new Error('Provider not found');
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while updating the Provider."
    });
  }
};

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}/providers/{providerName}:
 *   delete:
 *     summary: Delete a specific provider
 *     description: Delete a specific provider and all its associated architectures and files from the system
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: myorg
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name/ID
 *         example: ubuntu-server
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *         example: "1.0.0"
 *       - in: path
 *         name: providerName
 *         required: true
 *         schema:
 *           type: string
 *         description: Provider name to delete
 *         example: virtualbox
 *     responses:
 *       200:
 *         description: Provider and associated architectures deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Provider and associated architectures deleted successfully!"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized!"
 *       404:
 *         description: Organization, box, version, or provider not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Provider not found."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while deleting the Provider."
 */
exports.delete = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: db.box,
          as: 'box',
          where: { name: boxId },
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber }
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    // Extract the box and version from the organization data
    const box = organizationData.users.flatMap(user => user.box)
      .find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`
      });
    }

    // Find the provider to delete
    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id }
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId} in organization ${organization}.`
      });
    }

    // Find all architectures associated with the provider
    const architectures = await Architecture.findAll({
      where: { providerId: provider.id }
    });

    // Delete all files and directories associated with each architecture
    for (const architecture of architectures) {
      const filePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architecture.name);
      
      // Delete files from the file system
      fs.rm(filePath, { recursive: true, force: true }, (err) => {
        if (err) {
          log.app.info(`Could not delete the architecture directory: ${err}`);
        }
      });

      // Delete architecture from the database
      await architecture.destroy();
    }

    // Delete the provider from the database using the provider object
    await provider.destroy();

    // Delete the provider's directory
    const providerPath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName);
    fs.rm(providerPath, { recursive: true, force: true }, (err) => {
      if (err) {
        log.app.info(`Could not delete the provider directory: ${err}`);
      }
    });

    return res.send({ message: "Provider and associated architectures deleted successfully!" });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the Provider."
    });
  }
};

/**
 * @swagger
 * /api/organizations/{organization}/boxes/{boxId}/versions/{versionNumber}/providers:
 *   delete:
 *     summary: Delete all providers for a version
 *     description: Delete all providers associated with a specific box version
 *     tags: [Providers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *         description: Organization name
 *         example: myorg
 *       - in: path
 *         name: boxId
 *         required: true
 *         schema:
 *           type: string
 *         description: Box name/ID
 *         example: ubuntu-server
 *       - in: path
 *         name: versionNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Version number
 *         example: "1.0.0"
 *     responses:
 *       200:
 *         description: All providers deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "All providers deleted successfully!"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Unauthorized!"
 *       404:
 *         description: Organization, box, version not found, or no providers found to delete
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No providers found to delete."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Some error occurred while deleting the providers."
 */
exports.deleteAllByVersion = async (req, res) => {
  const { organization, boxId, versionNumber } = req.params;

  try {
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        include: [{
          model: db.box,
          as: 'box',
          where: { name: boxId },
          include: [{
            model: db.versions,
            as: 'versions',
            where: { versionNumber: versionNumber }
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    // Extract the box and version from the organization data
    const box = organizationData.users.flatMap(user => user.box)
      .find(box => box.name === boxId);

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found in organization ${organization}.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);

    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId} in organization ${organization}.`
      });
    }

    const deleted = await Provider.destroy({
      where: { versionId: version.id }
    });

    if (deleted) {
      return res.send({ message: "All providers deleted successfully!" });
    }

    res.status(404).send({
      message: "No providers found to delete."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the providers."
    });
  }
};
