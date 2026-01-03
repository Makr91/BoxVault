// ticket.js
const { loadConfig } = require('../../utils/config-loader');
const { log } = require('../../utils/Logger');

/**
 * @swagger
 * /api/config/ticket:
 *   get:
 *     summary: Get ticket system configuration
 *     description: Retrieve ticket system configuration settings (public endpoint)
 *     tags: [Configuration]
 *     responses:
 *       200:
 *         description: Ticket system configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ticket_system:
 *                   type: object
 *                   properties:
 *                     enabled:
 *                       type: object
 *                     base_url:
 *                       type: object
 *                     req_type:
 *                       type: object
 *                     context:
 *                       type: object
 *       404:
 *         description: Ticket system not configured
 *       500:
 *         description: Internal server error
 */
exports.getTicketConfig = (req, res) => {
  void req;
  try {
    const data = loadConfig('app');
    if (data && data.ticket_system) {
      return res.send({ ticket_system: data.ticket_system });
    }
    return res.status(404).send({ message: req.__('config.ticketSystemNotConfigured') });
  } catch (err) {
    log.error.error('Error getting ticket config:', err);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
