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
  const isServiceAccount = req.isServiceAccount || false;
  const userId = req.userId;

  try {
    // First get organization data
    const organizationData = await Organization.findOne({
      where: { name: organization },
      include: [{
        model: Users,
        as: 'users',
        include: [{
          model: Box,
          as: 'box',
          where: name ? { name: { [Op.like]: `%${name}%` } } : undefined,
          include: [{
            model: Users,
            as: 'user'
          }]
        }]
      }]
    });

    if (!organizationData) {
      return res.status(404).send({
        message: `Organization not found with name: ${organization}.`
      });
    }

    // Get all boxes from the organization
    let boxes = organizationData.users.flatMap(user => user.box);

    // If it's a service account, find the owner's boxes
    if (isServiceAccount && userId) {
      const serviceAccount = await db.service_account.findOne({
        where: { id: userId },
        include: [{
          model: Users,
          as: 'user'
        }]
      });

      if (serviceAccount && serviceAccount.user) {
        // Filter boxes to show only those owned by the service account's owner
        boxes = boxes.filter(box => box.user && box.user.id === serviceAccount.user.id);
      }
    }

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

    // Get all boxes from the organization
    let boxes = organizationData.users.flatMap(user => user.box);

    // For each box, check if it was created by a service account
    const serviceAccountBoxes = await Promise.all(
      boxes.map(async box => {
        const serviceAccount = await db.service_account.findOne({
          where: { id: box.userId },
          include: [{
            model: Users,
            as: 'user'
          }]
        });
        return { box, serviceAccount };
      })
    );

    // Filter boxes based on access rules
    boxes = boxes.filter((box, index) => {
      const { serviceAccount } = serviceAccountBoxes[index];

      // Allow access if:
      // 1. Box is public
      // 2. User belongs to organization
      // 3. User is the owner of the service account that created the box
      return (
        box.isPublic ||
        (userId && userOrganizationId === organizationData.id) ||
        (serviceAccount && serviceAccount.user && serviceAccount.user.id === userId)
      );
    });

    // Map boxes to response format
    const formattedBoxes = boxes.map(box => ({
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

const formatVagrantResponse = (box, organization, baseUrl, requestedName) => {
  // Format response exactly as Vagrant expects based on box_metadata.rb
  const response = {
    // Required fields from BoxMetadata class
    name: requestedName, // Use the exact name that Vagrant requested
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
            url: `${baseUrl}/${organization.name}/boxes/${box.name}/versions/${version.versionNumber.replace(/^v/, '')}/providers/${provider.name}/${arch.name}/vagrant.box`,
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
    requestedName,
    actualName: response.name,
    url: `${baseUrl}/${organization.name}/boxes/${box.name}`,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(response, null, 2)
  });

  // Verify the name matches exactly what Vagrant requested
  if (response.name !== requestedName) {
    console.error('Name mismatch:', {
      requested: requestedName,
      actual: response.name
    });
  }

  return response;
};

exports.findOne = async (req, res) => {
  const { organization, name } = req.params;
  // Get auth info either from vagrantHandler or x-access-token
  let userId = req.userId;  // Set by vagrantHandler for Vagrant requests
  let isServiceAccount = req.isServiceAccount;  // Set by vagrantHandler for Vagrant requests

  // If not set by vagrantHandler, try x-access-token
  if (!userId) {
    const token = req.headers["x-access-token"];
    if (token) {
      try {
        const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;
      } catch (err) {
        console.warn("Invalid x-access-token:", err.message);
      }
    }
  }

  console.log('Auth context in findOne:', {
    userId,
    isServiceAccount,
    isVagrantRequest: req.isVagrantRequest,
    headers: req.headers
  });

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

    // First try to find the box through organization users
    let box = organizationData.users.flatMap(user => user.box).find(box => box.name === name);

    // If box not found and we have a service account, try to find it through service accounts
    if (!box && isServiceAccount) {
      const serviceAccount = await db.service_account.findOne({
        where: { id: userId },
        include: [{
          model: Users,
          as: 'user',
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

      if (serviceAccount?.user?.box) {
        box = serviceAccount.user.box.find(b => b.name === name);
      }
    }

    if (!box) {
      return res.status(404).send({ message: `Box not found with name: ${name}.` });
    }

    let response;
    if (req.isVagrantRequest) {
      // Format response for Vagrant metadata request
      const baseUrl = appConfig.boxvault.origin.value;
      // Always use the requested name from vagrantInfo
      // Use the requested name from vagrantInfo if available, otherwise construct it
      const requestedName = req.vagrantInfo?.requestedName || `${organization}/${name}`;
      response = formatVagrantResponse(box, organizationData, baseUrl, requestedName);
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

    // If the box is private, check access permissions
    if (!userId) {
      return res.status(403).json({ message: "Unauthorized access to private box." });
    }

    // Check if this box was created by a service account
    const serviceAccount = await db.service_account.findOne({
      where: { id: box.userId },
      include: [{
        model: Users,
        as: 'user'
      }]
    });

    // Allow access if:
    // 1. The user is the owner of the service account that created the box
    // 2. The user belongs to the organization
    // 3. The requester is a service account
    if (
      (serviceAccount && serviceAccount.user && serviceAccount.user.id === userId) ||
      organizationData.users.some(user => user.id === userId) ||
      isServiceAccount
    ) {
      return res.json(response);
    }

    return res.status(403).json({ message: "Unauthorized access to private box." });

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

// Handle Vagrant box downloads
exports.downloadBox = async (req, res) => {
  const { organization, name, version, provider, architecture } = req.params;
  
  // Get auth info either from vagrantHandler or x-access-token
  let userId = req.userId;  // Set by vagrantHandler for Vagrant requests
  let isServiceAccount = req.isServiceAccount;  // Set by vagrantHandler for Vagrant requests

  // If not set by vagrantHandler, try x-access-token
  if (!userId) {
    const token = req.headers["x-access-token"];
    if (token) {
      try {
        const decoded = jwt.verify(token, authConfig.jwt.jwt_secret.value);
        userId = decoded.id;
        isServiceAccount = decoded.isServiceAccount || false;
      } catch (err) {
        console.warn("Invalid x-access-token:", err.message);
      }
    }
  }

  console.log('Auth context in downloadBox:', {
    userId,
    isServiceAccount,
    isVagrantRequest: req.isVagrantRequest,
    headers: req.headers
  });

  try {
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

    // Function to handle the download redirect
    const handleDownload = () => {
      const downloadUrl = `/api/organization/${organization}/box/${name}/version/${version}/provider/${provider}/architecture/${architecture}/file/download`;
      res.redirect(downloadUrl);
    };

    // If the box is public, allow download
    if (box.isPublic) {
      return handleDownload();
    }

    // For private boxes, check authentication
    if (req.isVagrantRequest) {
      // For Vagrant requests, we already have userId and isServiceAccount set by vagrantHandler
      if (req.isServiceAccount) {
        return handleDownload();
      }
    }

    // Check if we have a user ID (either from vagrantHandler or x-access-token)
    if (!req.userId) {
      return res.status(403).send({ message: "Unauthorized access to private box." });
    }

    // Check if user belongs to the organization
    const user = organizationData.users.find(user => user.id === req.userId);
    if (!user) {
      return res.status(403).send({ message: "Unauthorized access to private box." });
    }

    // User belongs to organization, allow download
    return handleDownload();

  } catch (err) {
    console.error('Error in downloadBox:', err);
    res.status(500).send({ 
      message: "Error processing download request",
      error: err.message 
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
