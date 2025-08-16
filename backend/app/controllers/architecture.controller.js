// architecture.controller.js
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../utils/config-loader');
const jwt = require("jsonwebtoken");
const db = require("../models");
const Architecture = db.architectures;
const Provider = db.providers;
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

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture:
 *   post:
 *     summary: Create a new architecture for a provider
 *     description: Create a new architecture (e.g., amd64, arm64) for a specific provider within a box version
 *     tags: [Architectures]
 *     security:
 *       - JwtAuth: []
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
 *         description: Box name
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
 *                 description: Architecture name
 *                 example: amd64
 *               defaultBox:
 *                 type: boolean
 *                 description: Whether this should be the default architecture for the provider
 *                 example: true
 *     responses:
 *       200:
 *         description: Architecture created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization, box, version, or provider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.create = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const { name, defaultBox } = req.body;

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

    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id }
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    if (defaultBox) {
      // Set all other architectures' defaultBox to false
      await Architecture.update(
        { defaultBox: false },
        { where: { providerId: provider.id } }
      );
    }

    const architecture = await Architecture.create({
      name,
      defaultBox: defaultBox || false,
      providerId: provider.id
    });

    res.send(architecture);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while creating the Architecture."
    });
  }
};

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture:
 *   get:
 *     summary: Get all architectures for a provider
 *     description: Retrieve all architectures available for a specific provider within a box version. Access depends on box visibility and user authentication.
 *     tags: [Architectures]
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
 *         description: Box name
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
 *         description: Optional JWT token for accessing private boxes
 *     responses:
 *       200:
 *         description: Architectures retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Architecture'
 *       403:
 *         description: Access denied - private box requires authentication
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Box, version, or provider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.findAllByProvider = async (req, res) => {
  const { organization, boxId, versionNumber, providerName } = req.params;
  const token = req.headers["x-access-token"];
  let userId = null;

  try {
    // Find the box and its public status
    const box = await db.box.findOne({
      where: { name: boxId },
      attributes: ['id', 'name', 'isPublic'],
      include: [{
        model: db.versions,
        as: 'versions',
        where: { versionNumber: versionNumber },
        include: [{
          model: db.providers,
          as: 'providers',
          where: { name: providerName }
        }]
      }]
    });

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);
    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId}.`
      });
    }

    const provider = version.providers.find(provider => provider.name === providerName);
    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    // Check if the box is public or if the user is authenticated
    if (box.isPublic || token) {
      const architectures = await Architecture.findAll({
        where: { providerId: provider.id },
      });

      // If the box is private and authenticated, check if the user belongs to the organization
      if (!box.isPublic && userId) {
        const organizationData = await db.organization.findOne({
          where: { name: organization },
          include: [{
            model: db.user,
            as: 'users',
            where: { id: userId }
          }]
        });

        if (!organizationData) {
          return res.status(403).send({ message: "Unauthorized access to architecture." });
        }
      }

      return res.send(architectures);
    }

    // If the box is private and no token is present, return unauthorized
    return res.status(403).send({ message: "Access denied. Private box requires authentication." });

  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving architectures." });
  }
};

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   delete:
 *     summary: Delete a specific architecture
 *     description: Delete a specific architecture and its associated files from the system
 *     tags: [Architectures]
 *     security:
 *       - JwtAuth: []
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
 *         description: Box name
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
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name to delete
 *         example: amd64
 *     responses:
 *       200:
 *         description: Architecture deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization, box, version, provider, or architecture not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.delete = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;

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

    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id }
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    const deleted = await Architecture.destroy({
      where: { name: architectureName, providerId: provider.id }
    });

    if (deleted) {
      return res.send({ message: "Architecture deleted successfully!" });
    }

    res.status(404).send({
      message: "Architecture not found."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the Architecture."
    });
  }
};

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture:
 *   delete:
 *     summary: Delete all architectures for a provider
 *     description: Delete all architectures associated with a specific provider within a box version
 *     tags: [Architectures]
 *     security:
 *       - JwtAuth: []
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
 *         description: Box name
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
 *     responses:
 *       200:
 *         description: All architectures deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization, box, version, provider not found, or no architectures found to delete
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.deleteAllByProvider = async (req, res) => {
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

    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id }
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    const deleted = await Architecture.destroy({
      where: { providerId: provider.id }
    });

    if (deleted) {
      return res.send({ message: "All architectures deleted successfully!" });
    }

    res.status(404).send({
      message: "No architectures found to delete."
    });
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the architectures."
    });
  }
};

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   get:
 *     summary: Get a specific architecture
 *     description: Retrieve details of a specific architecture. Requires authentication and appropriate access permissions.
 *     tags: [Architectures]
 *     security:
 *       - JwtAuth: []
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
 *         description: Box name
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
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Architecture name
 *         example: amd64
 *       - in: header
 *         name: x-access-token
 *         required: true
 *         schema:
 *           type: string
 *         description: JWT authentication token
 *     responses:
 *       200:
 *         description: Architecture retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Invalid or expired token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: No token provided or unauthorized access
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Box, version, provider, or architecture not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.findOne = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const token = req.headers["x-access-token"];

  if (!token) {
    return res.status(403).send({ message: "No token provided!" });
  }

  try {
    const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
    req.userId = decoded.id;
    req.isServiceAccount = decoded.isServiceAccount;
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized!" });
  }

  try {
    // Find the box and its public status
    const box = await db.box.findOne({
      where: { name: boxId },
      attributes: ['id', 'name', 'isPublic'],
      include: [{
        model: db.versions,
        as: 'versions',
        where: { versionNumber: versionNumber },
        include: [{
          model: db.providers,
          as: 'providers',
          where: { name: providerName }
        }]
      }]
    });

    if (!box) {
      return res.status(404).send({
        message: `Box ${boxId} not found.`
      });
    }

    const version = box.versions.find(version => version.versionNumber === versionNumber);
    if (!version) {
      return res.status(404).send({
        message: `Version ${versionNumber} not found for box ${boxId}.`
      });
    }

    const provider = version.providers.find(provider => provider.name === providerName);
    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`
      });
    }

    // If the box is public or it's a service account, allow access
    if (box.isPublic || req.isServiceAccount) {
      const architecture = await Architecture.findOne({
        where: { name: architectureName, providerId: provider.id },
        attributes: ['name'] // Specify limited fields
      });
      return res.send(architecture);
    }

    // If the box is private and it's not a service account, check if the user belongs to the organization
    const organizationData = await db.organization.findOne({
      where: { name: organization },
      include: [{
        model: db.user,
        as: 'users',
        where: { id: req.userId }
      }]
    });

    if (!organizationData) {
      return res.status(403).send({ message: "Unauthorized access to architecture." });
    }

    // If the user belongs to the organization, allow access
    const architecture = await Architecture.findOne({ where: { name: architectureName, providerId: provider.id } });
    return res.send(architecture);

  } catch (err) {
    res.status(500).send({ message: err.message || "Some error occurred while retrieving the Architecture." });
  }
};

/**
 * @swagger
 * /api/organization/{organization}/box/{boxId}/version/{versionNumber}/provider/{providerName}/architecture/{architectureName}:
 *   put:
 *     summary: Update an architecture by name
 *     description: Update an architecture's properties including name and default status. Also handles file system directory renaming when architecture name changes.
 *     tags: [Architectures]
 *     security:
 *       - JwtAuth: []
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
 *         description: Box name
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
 *       - in: path
 *         name: architectureName
 *         required: true
 *         schema:
 *           type: string
 *         description: Current architecture name to update
 *         example: amd64
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: New architecture name
 *                 example: arm64
 *               defaultBox:
 *                 type: boolean
 *                 description: Whether this should be the default architecture for the provider
 *                 example: true
 *     responses:
 *       200:
 *         description: Architecture updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Architecture'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Organization, box, version, provider, or architecture not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
exports.update = async (req, res) => {
  const { organization, boxId, versionNumber, providerName, architectureName } = req.params;
  const { name, defaultBox } = req.body;

  
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, architectureName);
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, boxId, versionNumber, providerName, name);

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

    const provider = await Provider.findOne({
      where: { name: providerName, versionId: version.id }
    });

    if (!provider) {
      return res.status(404).send({
        message: `Provider ${providerName} not found for version ${versionNumber} in box ${boxId}.`
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

    const [updated] = await Architecture.update(
      { name, defaultBox },
      { where: { name: architectureName, providerId: provider.id } }
    );

    if (updated) {
      const updatedArchitecture = await Architecture.findOne({ where: { name: name, providerId: provider.id } });
      return res.send(updatedArchitecture);
    }

    throw new Error('Architecture not found');
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while updating the Architecture."
    });
  }
};
