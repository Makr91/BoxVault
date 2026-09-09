// ticket.js
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';

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
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const getTicketConfig = (req, res) => {
  try {
    const data = loadConfig('app');
    if (data && data.ticket_system) {
      return res.send({ ticket_system: data.ticket_system });
    }
    return problem(res, req, {
      status: 404,
      type: 'not-found',
      title: req.__('config.ticketSystemNotConfigured'),
    });
  } catch (err) {
    log.error.error('Error getting ticket config:', err);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
