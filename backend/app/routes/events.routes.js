import { Router } from 'express';
import { authJwt } from '../middleware/index.js';
import { authorizationCredential } from '../utils/requestAuth.js';
import { openEventStream } from '../utils/events.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

const requireCredential = (req, res, next) => {
  if (!req.headers['x-access-token'] && !authorizationCredential(req)) {
    return res.status(401).send({ message: 'Unauthorized!', error: 'TOKEN_INVALID' });
  }
  return next();
};

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: The universal event stream
 *     description: One server-sent event stream per tab, the topics multiplexed on it. The first frame is retry 3000 and event ready with the current id and the subscribed topics; every event carries an id, a kebab-case event name and one JSON object; a comment heartbeat is sent every 25 seconds while idle. A Last-Event-ID inside the ring of the last 500 events or 5 minutes replays everything after it, one outside the ring answers event reset. Topic session sends session-terminated, topic notifications sends unread-count.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: topics
 *         schema:
 *           type: string
 *         description: Comma-separated topics to subscribe; unknown topics are ignored and an empty list subscribes every core topic
 *         example: session,notifications
 *       - in: header
 *         name: Last-Event-ID
 *         schema:
 *           type: string
 *         description: The id of the last frame processed, on a reconnect
 *     responses:
 *       200:
 *         description: The stream
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       401:
 *         description: No session or an invalid one
 *       403:
 *         description: The caller may not read the stream
 */
router.get('/events', [requireCredential, authJwt.verifyToken, authJwt.isUser], openEventStream);

export default router;
