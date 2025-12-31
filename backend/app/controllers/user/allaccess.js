// allaccess.js
// This endpoint returns static project information - no imports needed

/**
 * @swagger
 * /api/users/all:
 *   get:
 *     summary: Get project information
 *     description: Retrieve general information about the BoxVault project (public access)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Project information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 title:
 *                   type: string
 *                   example: "BoxVault Project Synopsis"
 *                 description:
 *                   type: string
 *                   example: "BoxVault is a self-hosted solution designed to store and manage Virtual Machine templates."
 *                 components:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       details:
 *                         type: array
 *                         items:
 *                           type: string
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *                 goal:
 *                   type: string
 */
exports.allAccess = (req, res) => {
  // Log request for audit purposes
  const { log } = require('../../utils/Logger');
  log.app.debug('All access endpoint called', { method: req.method });

  const projectData = {
    title: 'BoxVault Project Synopsis',
    description:
      'BoxVault is a self-hosted solution designed to store and manage Virtual Machine templates.',
    components: [
      {
        title: 'Backend API',
        details: [
          'Built using Node.js and Express.js',
          'Handles user authentication and authorization',
          'Provides endpoints for uploading, storing, and retrieving Vagrant boxes',
          'Uses MariaDB for database operations',
        ],
      },
      {
        title: 'Frontend Interface',
        details: [
          'Created with React and React Hooks',
          'Offers a user-friendly interface for interacting with the backend API',
          'Allows users to register, login, upload boxes, view box listings, and manage their accounts',
        ],
      },
    ],
    features: [
      'User authentication and role-based access control',
      'File upload and storage management for Vagrant boxes',
      'Box listing and filtering capabilities',
      'User profile management',
    ],
    goal: 'The project aims to provide a secure, scalable, and easy-to-use platform for developers to store and share their Virtual Machine templates within their own infrastructure.',
  };

  res.status(200).json(projectData);
};
