// restart.js
const { log } = require('../../utils/Logger');

/**
 * @swagger
 * /api/config/restart-server:
 *   post:
 *     summary: Restart the BoxVault server
 *     description: |
 *       **⚠️ DANGEROUS OPERATION ⚠️**
 *
 *       Initiates a server restart using SystemD service management. This will:
 *       - Terminate all active connections
 *       - Stop the current server process
 *       - Restart the BoxVault service via SystemD
 *       - Cause temporary service unavailability
 *
 *       **Use with extreme caution!** Only use this endpoint when necessary for applying critical configuration changes that require a server restart.
 *
 *       The restart is performed by exiting the process with a failure code, which triggers SystemD's automatic restart mechanism configured with `Restart=on-failure`.
 *     tags: [Configuration]
 *     security:
 *       - JwtAuth: []
 *     responses:
 *       200:
 *         description: Server restart initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Server restart initiated"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Admin privileges required
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
exports.restartServer = (req, res) => {
  void req;
  log.app.info('Initiating server restart via process exit...');

  // Send response immediately before process exits
  res.status(200).json({ message: req.__('config.restartInitiated') });

  // Close the response to ensure it's sent
  res.end();

  // Give a brief moment for the response to be sent
  setTimeout(() => {
    log.app.info('Exiting process to trigger SystemD restart...');
    process.exitCode = 1; // EXIT_FAILURE - triggers SystemD Restart=on-failure
    // Process will exit naturally after event loop empties
  }, 100);
};
