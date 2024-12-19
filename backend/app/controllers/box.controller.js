const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const jwt = require("jsonwebtoken");
const db = require("../models");
const Organization = db.organization;
const Users = db.user;
const Box = db.box;
const Architecture = db.architectures;
const Version = db.versions;
const Provider = db.providers;
const File = db.files;
const Op = db.Sequelize.Op;
const authConfigPath = path.join(__dirname, '../config/auth.config.yaml');
let authConfig;
try {
  const fileContents = fs.readFileSync(authConfigPath, 'utf8');
  authConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load auth configuration: ${e.message}`);
}

const appConfigPath = path.join(__dirname, '../config/app.config.yaml');
let appConfig;
try {
  const fileContents = fs.readFileSync(appConfigPath, 'utf8');
  appConfig = yaml.load(fileContents);
} catch (e) {
  console.error(`Failed to load App configuration: ${e.message}`);
}

exports.create = async (req, res) => {
  const { organization } = req.params;
  const { name, description, published, isPublic } = req.body;
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, name || name);

  if (!req.body.name) {
    res.status(400).send({
      message: "Name cannot be empty!"
    });
    return;
  }

  // Create the new directory if it doesn't exist
  if (!fs.existsSync(newFilePath)) {
    fs.mkdirSync(newFilePath, { recursive: true });
  }

  // Create a Box
  const box = {
    name: req.body.name,
    description: description,
    published: published ? published : false,
    isPublic: isPublic ? isPublic : false,
    userId: req.userId
  };

  // Save Box in the database
  try {
    const data = await Box.create(box);
    res.send(data);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while creating the Box."
    });
  }
};

// Retrieve all public boxes
exports.findAllPublic = async (req, res) => {
  try {
    const publicBoxes = await Box.findAll({
      where: { isPublic: true },
      include: [
        {
          model: db.versions,
          as: 'versions',
          include: [
            {
              model: db.providers,
              as: 'providers',
              include: [
                {
                  model: db.architectures,
                  as: 'architectures',
                  include: [
                    {
                      model: File,
                      as: 'files'
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          model: db.user,
          as: 'user',
          include: [
            {
              model: db.organization,
              as: 'organization',
              attributes: ['id', 'name', 'emailHash'] 
            }
          ]
        }
      ]
    });

    res.send(publicBoxes);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving public boxes."
    });
  }
};

// Method to retrieve a public box by name
exports.findPublicBoxByName = async (req, res) => {
  const { name } = req.params;

  try {
    const box = await Box.findOne({
      where: { name, isPublic: true },
      include: [
        {
          model: db.versions,
          as: 'versions',
          include: [
            {
              model: db.providers,
              as: 'providers',
              include: [
                {
                  model: db.architectures,
                  as: 'architectures',
                  include: [
                    {
                      model: File,
                      as: 'files'
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          model: db.user,
          as: 'user',
          include: [
            {
              model: db.organization,
              as: 'organization',
              attributes: ['id', 'name', 'emailHash'] 
            }
          ]
        }
      ]
    });

    if (box) {
      res.send(box);
    } else {
      res.status(404).send({
        message: `Cannot find public box with name=${name}.`
      });
    }
  } catch (err) {
    res.status(500).send({
      message: "Error retrieving public box with name=" + name
    });
  }
};

// Retrieve all Boxes from the database under an organization.
exports.findAll = async (req, res) => {
  const { organization } = req.params;
  const { name } = req.query;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
      include: [{
        model: Users,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: name ? { name: { [Op.like]: `%${name}%` } } : undefined
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    const boxes = organizationData.users.flatMap(user => user.box);
    res.send(boxes);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving boxes."
    });
  }
};

exports.getOrganizationBoxDetails = async (req, res) => {
  const { organization } = req.params;
  const token = req.headers["x-access-token"];
  let userId = null;
  let userOrganizationId = null;
  let isServiceAccount = false;

  try {
    // If a token is provided, verify it and extract the user ID
    if (token) {
      try {
        const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;

        // Retrieve the user's organization ID
        if (!isServiceAccount) {
          const user = await Users.findOne({
            where: { id: userId },
            include: [{ model: Organization, as: 'organization' }]
          });

          if (user) {
            userOrganizationId = user.organization.id;
          }
        }
      } catch (err) {
        console.warn(`Unauthorized User.`);
      }
    }

    // Retrieve all boxes from the specified organization
    const organizationData = await Organization.findOne({
      where: { name: organization },
      include: [{
        model: Users,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          include: [
            {
              model: Version,
              as: 'versions',
              include: [
                {
                  model: Provider,
                  as: 'providers',
                  include: [
                    {
                      model: Architecture,
                      as: 'architectures',
                      include: [
                        {
                          model: File,
                          as: 'files'
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              model: Users,
              as: 'user',
              include: [
                {
                  model: db.organization,
                  as: 'organization',
                  attributes: ['id', 'name', 'emailHash'] 
                }
              ]
            }
          ]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({ message: "Organization not found." });
    }

    // Filter boxes based on access rules
    const boxes = organizationData.users.flatMap(user => user.box).filter(box => {
      // Allow access to public boxes for any user
      if (box.isPublic) {
        return true;
      }
      // Allow access to private boxes only if the user is part of the organization or is a service account
      if (userId && (isServiceAccount || userOrganizationId === organizationData.id)) {
        return true;
      }
      return false;
    }).map(box => ({
      id: box.id,
      name: box.name,
      description: box.description,
      published: box.published,
      isPublic: box.isPublic,
      userId: box.userId,
      createdAt: box.createdAt,
      updatedAt: box.updatedAt,
      versions: box.versions.map(version => ({
        id: version.id,
        versionNumber: version.versionNumber,
        description: version.description,
        boxId: version.boxId,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        providers: version.providers.map(provider => ({
          id: provider.id,
          name: provider.name,
          description: provider.description,
          versionId: provider.versionId,
          createdAt: provider.createdAt,
          updatedAt: provider.updatedAt,
          architectures: provider.architectures.map(architecture => ({
            id: architecture.id,
            name: architecture.name,
            defaultBox: architecture.defaultBox,
            providerId: architecture.providerId,
            createdAt: architecture.createdAt,
            updatedAt: architecture.updatedAt,
            files: architecture.files.map(file => ({
              id: file.id,
              fileName: file.fileName,
              checksum: file.checksum,
              checksumType: file.checksumType,
              downloadCount: file.downloadCount,
              fileSize: file.fileSize,
              createdAt: file.createdAt,
              updatedAt: file.updatedAt,
              architectureId: file.architectureId
            }))
          }))
        }))
      })),
      user: box.user ? {
        id: box.user.id,
        username: box.user.username,
        email: box.user.email,
        emailHash: box.user.emailHash,
        suspended: box.user.suspended,
        createdAt: box.user.createdAt,
        updatedAt: box.user.updatedAt,
        organization: box.user.organization ? {
          id: box.user.organization.id,
          name: box.user.organization.name,
          emailHash: box.user.organization.emailHash,
        } : null
      } : null
    }));

    res.status(200).send(boxes);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving the organization details."
    });
  }
};

exports.discoverAll = async (req, res) => {
  try {
    let boxes;

    if (req.user) {
      // If the user is authenticated, retrieve all boxes
      boxes = await Box.findAll({
        include: [
          {
            model: db.versions,
            as: 'versions',
            include: [
              {
                model: db.providers,
                as: 'providers',
                include: [
                  {
                    model: db.architectures,
                    as: 'architectures',
                    include: [
                      {
                        model: db.files,
                        as: 'files'
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            model: db.user,
            as: 'user',
            include: [
              {
                model: db.organization,
                as: 'organization',
                attributes: ['id', 'name', 'emailHash'] 
              }
            ]
          }
        ]
      });
    } else {
      // If the user is not authenticated, retrieve only public boxes
      boxes = await Box.findAll({
        where: { isPublic: true },
        include: [
          {
            model: db.versions,
            as: 'versions',
            include: [
              {
                model: db.providers,
                as: 'providers',
                include: [
                  {
                    model: db.architectures,
                    as: 'architectures',
                    include: [
                      {
                        model: db.files,
                        as: 'files'
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            model: db.user,
            as: 'user',
            include: [
              {
                model: db.organization,
                as: 'organization',
                attributes: ['id', 'name', 'emailHash'] // Include emailHash here
              }
            ]
          }
        ]
      });
    }

    // Ensure the emailHash is included in the response
    const restructuredBoxes = boxes.map(box => {
      const boxJson = box.toJSON();
      if (boxJson.user && boxJson.user.organization) {
        boxJson.user.organization.emailHash = boxJson.user.organization.emailHash || null;
      }
      return boxJson;
    });

    res.send(restructuredBoxes);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving boxes."
    });
  }
};

const formatVagrantResponse = (box, organization, baseUrl) => {
  // Format response exactly as Vagrant expects based on box_metadata.rb
  const fullName = `${organization.name}/${box.name}`;
  const response = {
    // Required fields from BoxMetadata class
    name: fullName, // This must match exactly what Vagrant requested
    description: box.description || "Build",
    versions: box.versions.map(version => ({
      // Version must be a valid Gem::Version (no 'v' prefix)
      version: version.versionNumber.replace(/^v/, ''),
      status: "active",
      description_html: "<p>Build</p>\n",
      description_markdown: "Build",
      providers: version.providers.flatMap(provider => 
        provider.architectures.map(arch => {
          const file = arch.files[0];
          return {
            // Required fields from Provider class
            name: provider.name,
            url: `${baseUrl}/api/organization/${organization.name}/box/${box.name}/version/${version.versionNumber.replace(/^v/, '')}/provider/${provider.name}/architecture/${arch.name}/file/download`,
            checksum: file?.checksum || "",
            checksum_type: (file?.checksumType === "NULL" ? "sha256" : file?.checksumType?.toLowerCase()) || "sha256",
            architecture: arch.name,
            default_architecture: arch.defaultBox || true
          };
        })
      )
    }))
  };

  // Log the complete response for debugging
  console.log('Vagrant Response:', {
    url: `${baseUrl}/${organization.name}/boxes/${box.name}`,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(response, null, 2)
  });

  return response;
};

exports.findOne = async (req, res) => {
  const { organization, name } = req.params;
  const token = req.headers["x-access-token"];
  let userId = null;
  let isServiceAccount = false;

  if (token) {
    try {
      // Verify the token and extract the user ID
      const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
      userId = decoded.id;
      isServiceAccount = decoded.isServiceAccount || false;
    } catch (err) {
      return res.status(401).send({ message: "Unauthorized!" });
    }
  }

  try {
    // Find the organization and include users and boxes
    const organizationData = await Organization.findOne({
      where: { name: organization },
      include: [{
        model: Users,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { name },
          include: [
            {
              model: Version,
              as: 'versions',
              include: [
                {
                  model: Provider,
                  as: 'providers',
                  include: [
                    {
                      model: Architecture,
                      as: 'architectures',
                      include: [
                        {
                          model: File,
                          as: 'files'
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              model: Users,
              as: 'user',
              include: [
                {
                  model: Organization,
                  as: 'organization'
                }
              ]
            }
          ]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({ message: `Organization not found with name: ${organization}.` });
    }

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === name);

    if (!box) {
      return res.status(404).send({ message: `Box not found with name: ${name}.` });
    }

    let response;
    if (req.isVagrantRequest) {
      // Format response for Vagrant
      const baseUrl = appConfig.boxvault.origin.value;
      // Don't modify the box object, let formatVagrantResponse handle the name format
      response = formatVagrantResponse(box, organizationData, baseUrl);
    } else {
      // Format response for frontend
      response = {
        ...box.toJSON(),
        organization: {
          id: organizationData.id,
          name: organizationData.name,
          emailHash: organizationData.emailHash
        }
      };
    }

    // Set response headers for Vagrant requests
    if (req.isVagrantRequest) {
      res.set({
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Vary': 'Accept'
      });
    }

    // If the box is public, allow access
    if (box.isPublic) {
      return res.json(response);
    }

    // If the box is private, check if the user belongs to the organization or is a service account
    if (!userId) {
      return res.status(403).json({ message: "Unauthorized access to private box." });
    }

    if (isServiceAccount) {
      // Service accounts can access all boxes
      return res.json(response);
    }

    const user = organizationData.users.find(user => user.id === userId);
    if (!user) {
      return res.status(403).json({ message: "Unauthorized access to private box." });
    }

    // If the user belongs to the organization, allow access
    return res.json(response);

  } catch (err) {
    res.status(500).send({ message: "Error retrieving box with name=" + name });
  }
};

exports.update = async (req, res) => {
  const { organization, name } = req.params;
  const { name: updatedName, description, published, isPublic } = req.body;
  const oldFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, name);
  const newFilePath = path.join(appConfig.boxvault.box_storage_directory.value, organization, updatedName || name);

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
      include: [{
        model: Users,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { name }
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === name);

    if (!box) {
      return res.status(404).send({
        message: `Box not found with name: ${name} in organization=${organization}.`
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
      userId: req.userId
    });

    res.send(updatedBox);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while updating the Box."
    });
  }
};

exports.delete = async (req, res) => {
  const { organization, name } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
      include: [{
        model: Users,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { name }
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    const box = organizationData.users.flatMap(user => user.box).find(box => box.name === name);

    if (!box) {
      return res.status(404).send({
        message: `Box not found in organization ${organization}.`
      });
    }

    const deleted = await Box.destroy({
      where: { id: box.id }
    });

    if (deleted) {
      // Delete the box's directory
      const boxPath = path.join(appConfig.boxvault.box_storage_directory.value, organization, name);
      fs.rm(boxPath, { recursive: true, force: true }, (err) => {
        if (err) {
          console.log(`Could not delete the box directory: ${err}`);
        }
      });

      return res.send({ message: "Box deleted successfully!" });
    }

    throw new Error('Box not found');
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while deleting the Box."
    });
  }
};

// Delete all Boxes under an organization
exports.deleteAll = async (req, res) => {
  const { organization } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
      include: [{
        model: Users,
        as: 'users',
        include: [{
          model: Box,
          as: 'box'
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    const boxes = organizationData.users.flatMap(user => user.box);

    if (boxes.length === 0) {
      return res.status(404).send({
        message: `No boxes found under organization ${organization}.`
      });
    }

    // Delete all boxes from the database
    const deleted = await Box.destroy({
      where: { id: boxes.map(box => box.id) },
      truncate: false
    });

    if (deleted) {
      // Delete each box's directory
      boxes.forEach(box => {
        const boxPath = path.join(appConfig.boxvault.box_storage_directory.value, organization, box.name);
        fs.rm(boxPath, { recursive: true, force: true }, (err) => {
          if (err) {
            console.log(`Could not delete the box directory for ${box.name}: ${err}`);
          }
        });
      });

      return res.send({ message: `${deleted} Boxes were deleted successfully under organization=${organization}!` });
    }

    throw new Error('No boxes found to delete');
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while removing all boxes."
    });
  }
};

// Find all published Boxes under an organization
exports.findAllPublished = async (req, res) => {
  const { organization } = req.params;

  try {
    const organizationData = await Organization.findOne({
      where: { name: organization },
      include: [{
        model: Users,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: { published: true }
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    const publishedBoxes = organizationData.users.flatMap(user => user.box);
    res.send(publishedBoxes);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving published boxes."
    });
  }
};
