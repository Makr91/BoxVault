import { Router } from 'express';
import { authJwt, oidcTokenRefresh } from '../middleware/index.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import {
  getVapidKey,
  createSubscription,
  deleteSubscription,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  deleteAllNotifications,
  sendTestToast,
  sendTestChannel,
} from '../controllers/notification.controller.js';

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

router.get('/notifications/vapid-key', apiLimiter, getVapidKey);

router.post('/notifications/subscriptions', apiLimiter, subscriptionAuth, createSubscription);

router.delete('/notifications/subscriptions', apiLimiter, subscriptionAuth, deleteSubscription);

router.post('/notifications/test/toast', apiLimiter, subscriptionAuth, sendTestToast);

router.post('/notifications/test/channel', apiLimiter, subscriptionAuth, sendTestChannel);

router.get('/notifications', apiLimiter, notificationAuth, listNotifications);

router.get('/notifications/unread-count', apiLimiter, notificationAuth, getUnreadCount);

router.post('/notifications/read-all', apiLimiter, notificationAuth, markAllNotificationsRead);

router.delete('/notifications', apiLimiter, notificationAuth, deleteAllNotifications);

router.post('/notifications/:id/read', apiLimiter, notificationAuth, markNotificationRead);

router.delete('/notifications/:id', apiLimiter, notificationAuth, deleteNotification);

export default router;
