import { Router } from 'express';
import { authJwt, oidcTokenRefresh } from '../middleware/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import {
  createSubscription,
  deleteSubscription,
  listNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from '../controllers/notification.controller.js';

const router = Router();

router.use(rateLimiter);

router.use((req, res, next) => {
  void req;
  res.header('Access-Control-Allow-Headers', 'x-access-token, Origin, Content-Type, Accept');
  next();
});

const notificationAuth = [oidcTokenRefresh, authJwt.verifyToken, authJwt.isUser];

router.post('/notifications/subscriptions', notificationAuth, createSubscription);

router.delete('/notifications/subscriptions', notificationAuth, deleteSubscription);

router.get('/notifications', notificationAuth, listNotifications);

router.get('/notifications/unread-count', notificationAuth, getUnreadCount);

router.post('/notifications/read-all', notificationAuth, markAllNotificationsRead);

router.post('/notifications/:id/read', notificationAuth, markNotificationRead);

router.delete('/notifications/:id', notificationAuth, deleteNotification);

export default router;
