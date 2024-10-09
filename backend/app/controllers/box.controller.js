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

exports.create = async (req, res) => {
  // Validate request
  if (!req.params.organization || !req.body.name) {
    res.status(400).send({
      message: "Organization and Name cannot be empty!"
    });
    return;
  }

  // Create a Box
  const box = {
    organization: req.params.organization, // Use organization from URL
    name: req.body.name,
    description: req.body.description,
    published: req.body.published ? req.body.published : false,
    isPublic: req.body.isPublic ? req.body.isPublic : false,
    userId: req.userId
  };

  // Save Box in the database
  try {
    const data = await Box.create(box);
    res.send(data);
  } catch (err) {
    res.status(500).send({
      message:
        err.message || "Some error occurred while creating the Box."
    });
  }
};

//Retrieve all public boxes
exports.findAllPublic = (req, res) => {
  Box.findAll({
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
        as: 'user'
      }
    ]
  })
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving public boxes."
      });
    });
};

// Method to retrieve a public box by name
exports.findPublicBoxByName = (req, res) => {
  const name = req.params.name;

  Box.findOne({
    where: { name: name, isPublic: true },
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
        as: 'user'
      }
    ]
  })
    .then(data => {
      if (data) {
        res.send(data);
      } else {
        res.status(404).send({
          message: `Cannot find public box with name=${name}.`
        });
      }
    })
    .catch(err => {
      res.status(500).send({
        message: "Error retrieving public box with name=" + name
      });
    });
};

// Retrieve all Boxes from the database under an organization.
exports.findAll = (req, res) => {
  const organization = req.params.organization;
  const name = req.query.name;
  var condition = { organization: organization };
  if (name) {
    condition.name = { [Op.like]: `%${name}%` };
  }

  Box.findAll({ where: condition })
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving boxes."
      });
    });
};

exports.getOrganizationBoxDetails = async (req, res) => {
  const { organization } = req.params;
  const token = req.headers["x-access-token"];

  try {
    // Find the organization by name
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
            }
          ]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: "Organization not found."
      });
    }

    // Prepare the response data
    const boxes = organizationData.users.flatMap(user => user.box.filter(box => {
      // Filter out private boxes for unauthenticated users
      if (!box.isPublic && !token) {
        return false;
      }
      return true;
    }).map(box => ({
      id: box.id,
      organization: organizationData.name,
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
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        emailHash: user.emailHash,
        suspended: user.suspended,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        organizationId: user.organizationId
      }
    })));

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
            as: 'user'
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
            as: 'user'
          }
        ]
      });
    }

    res.send(boxes);
  } catch (err) {
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving boxes."
    });
  }
};

// Find a single Box with a name under an organization
exports.findOne = async (req, res) => {
  const { organization, name } = req.params;
  const token = req.headers["x-access-token"];

  try {
    const box = await Box.findOne({
      where: { organization, name },
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
          as: 'user'
        }
      ]
    });

    if (!box) {
      return res.status(404).send({ message: `Box not found with name: ${name}.` });
    }

    // Check if the box is public
    if (box.isPublic) {
      return res.send(box);
    }

    // If the box is not public, check for authentication
    if (token) {
      jwt.verify(token, authConfig.jwt.jwt_secret, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized!" });
        }

        // If authenticated, return the box
        return res.send(box);
      });
    } else {
      // If no token is provided, return unauthorized for private boxes
      return res.status(403).send({ message: "Unauthorized access to private box." });
    }
  } catch (err) {
    res.status(500).send({ message: "Error retrieving box with name=" + name });
  }
};

// box.controller.js
exports.update = async (req, res) => {
  const { organization, name } = req.params;
  const { name: updatedName, description, published, isPublic } = req.body;
  const oldFilePath = path.join(__basedir, "resources/static/assets/uploads", organization, name);
  const newFilePath = path.join(__basedir, "resources/static/assets/uploads", organization, updatedName || name);

  try {
    const box = await Box.findOne({ where: { name, organization } });

    if (!box) {
      return res.status(404).send({
        message: `Box not found with name: ${name} in organization=${organization}.`
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


// Delete a Box with the specified id under an organization
exports.delete = async (req, res) => {
  const { organization, name } = req.params;

  try {
    const box = await Box.findOne({ where: { name, organization } });
    if (!box) {
      return res.status(404).send({
        message: `Box not found in organization ${organization}.`
      });
    }

    const deleted = await Box.destroy({
      where: { name, organization }
    });

    if (deleted) {
      // Delete the box's directory
      const boxPath = path.join(__basedir, "resources/static/assets/uploads", organization, name);
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
  const organization = req.params.organization;

  try {
    // Find all boxes under the organization
    const boxes = await Box.findAll({ where: { organization } });

    if (boxes.length === 0) {
      return res.status(404).send({
        message: `No boxes found under organization ${organization}.`
      });
    }

    // Delete all boxes from the database
    const deleted = await Box.destroy({
      where: { organization },
      truncate: false
    });

    if (deleted) {
      // Delete each box's directory
      boxes.forEach(box => {
        const boxPath = path.join(__basedir, "resources/static/assets/uploads", organization, box.name);
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
exports.findAllPublished = (req, res) => {
  const organization = req.params.organization;

  Box.findAll({ where: { published: true, organization: organization } })
    .then(data => {
      res.send(data);
    })
    .catch(err => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving boxes."
      });
    });
};