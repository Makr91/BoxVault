// ticket.js
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';

/**
 * @swagger
 * /api/config/ticket:
 *   get:
 *     summary: Get ticket system configuration
 *     description: The ticket_system section of the app configuration as plain values (public endpoint)
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
 *                       type: boolean
 *                     base_url:
 *                       type: string
 *                     req_type:
 *                       type: string
 *                     fallback_customer_id:
 *                       type: string
 *                     context:
 *                       type: string
 *       404:
 *         description: Ticket system not configured
 *       500:
 *         description: Internal server error
 */
export const getTicketConfig = (req, res) => {
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
