import { Router } from 'express';
import { authJwt, oidcTokenRefresh } from '../middleware/index.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { authorizationCredential } from '../utils/requestAuth.js';
import { openEventStream } from '../utils/events.js';
import { relayNotifications } from '../utils/notificationRelay.js';
import { problem } from '../utils/problem.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

const requireCredential = (req, res, next) => {
  if (!req.headers['x-access-token'] && !authorizationCredential(req)) {
    return problem(res, req, {
      status: 401,
      type: 'authentication',
      title: req.__('auth.unauthorized'),
    });
  }
  return next();
};

const openStream = (req, res) => {
  openEventStream(req, res);
  relayNotifications(req, res);
};

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: The universal event stream
 *     description: One server-sent event stream per tab, the topics multiplexed on it. The first frame is retry 3000 and event ready with the current id and the subscribed topics; every event carries an id, a kebab-case event name and one JSON object; a comment heartbeat is sent every 25 seconds while idle. A Last-Event-ID inside the ring of the last 500 events or 5 minutes replays everything after it, one outside the ring answers event reset. Topic session sends session-terminated; topic notifications sends, for an identity-provider session, the identity provider's notification-created, notification-read, notification-unread, notification-dismissed, inbox-read-all, inbox-cleared and unread-count, relayed unchanged from its own stream with the session's access token while the person holds a connection here; topic health sends health with the /api/health shape whenever the status or a service state changes; topic profile sends profile-updated with an empty object to the one person whose record changed, on an identity-provider push or a preferences write, so the tab re-reads GET /api/user. An identity-provider session whose access token is within the refresh threshold is refreshed before the stream opens and the new session JWT is answered in X-Refreshed-Token; when the access token the relay holds expires, the person's connections end without a frame so each tab reconnects with Last-Event-ID and a fresh token.
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: topics
 *         schema:
 *           type: string
 *         description: Comma-separated topics to subscribe; unknown topics are ignored and an empty list subscribes every core topic
 *         example: session,notifications,health,profile
 *       - in: header
 *         name: Last-Event-ID
 *         schema:
 *           type: string
 *         description: The id of the last frame processed, on a reconnect
 *     responses:
 *       200:
 *         description: The stream
 *         headers:
 *           X-Refreshed-Token:
 *             schema:
 *               type: string
 *             description: The refreshed session JWT, present when the identity-provider access token was refreshed before the stream opened
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       401:
 *         description: No session, an invalid one, or an identity-provider session whose refresh token the provider refused
 *       403:
 *         description: The caller may not read the stream
 */
router.get(
  '/events',
  apiLimiter,
  requireCredential,
  oidcTokenRefresh,
  authJwt.verifyToken,
  authJwt.isUser,
  openStream
);

export default router;
