import { Router } from 'express';
import { authJwt, oidcTokenRefresh } from '../middleware/index.js';
import {
  getVapidKey,
  createSubscription,
  deleteSubscription,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  sendTestToast,
  sendTestChannel,
} from '../controllers/notification.controller.js';
import { openSessionEventStream } from '../utils/sessionEvents.js';

const router = Router();

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

// The bell feed lives on the notification hub, so those routes need a fresh
// OIDC access token. Push subscriptions are BoxVault's own and work for local
// accounts too, so they only need a BoxVault session.
const notificationAuth = [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser];
const subscriptionAuth = [authJwt.verifyToken, authJwt.isUser];

router.get('/notifications/vapid-key', getVapidKey);

router.get('/notifications/events', subscriptionAuth, openSessionEventStream);

router.post('/notifications/subscriptions', subscriptionAuth, createSubscription);

router.delete('/notifications/subscriptions', subscriptionAuth, deleteSubscription);

router.post('/notifications/test/toast', subscriptionAuth, sendTestToast);

router.post('/notifications/test/channel', subscriptionAuth, sendTestChannel);

router.get('/notifications', notificationAuth, listNotifications);

router.get('/notifications/unread-count', notificationAuth, getUnreadCount);

router.post('/notifications/read-all', notificationAuth, markAllNotificationsRead);

router.post('/notifications/:id/read', notificationAuth, markNotificationRead);

router.delete('/notifications/:id', notificationAuth, deleteNotification);

export default router;
