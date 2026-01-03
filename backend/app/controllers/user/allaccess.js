// allaccess.js
const { log } = require('../../utils/Logger');

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
  log.app.debug('All access endpoint called', { method: req.method, locale: req.getLocale() });

  const projectData = {
    title: req.__('about.title'),
    description: req.__('about.description'),
    components: [
      {
        title: req.__('about.components.backend.title'),
        details: [
          req.__('about.components.backend.details.nodejs'),
          req.__('about.components.backend.details.auth'),
          req.__('about.components.backend.details.endpoints'),
          req.__('about.components.backend.details.database'),
        ],
      },
      {
        title: req.__('about.components.frontend.title'),
        details: [
          req.__('about.components.frontend.details.react'),
          req.__('about.components.frontend.details.interface'),
          req.__('about.components.frontend.details.features'),
        ],
      },
    ],
    features: [
      req.__('about.features.authentication'),
      req.__('about.features.boxManagement'),
      req.__('about.features.versionControl'),
      req.__('about.features.organizationSupport'),
      req.__('about.features.apiDocumentation'),
      req.__('about.features.secureStorage'),
    ],
    goal: req.__('about.goal'),
  };

  res.status(200).json(projectData);
};
