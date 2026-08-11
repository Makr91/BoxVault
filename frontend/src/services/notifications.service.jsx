import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const createSubscription = (subscription) =>
  axios.post(`${baseURL}/api/notifications/subscriptions`, subscription, {
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
  });

const deleteSubscription = (endpoint) =>
  axios.delete(`${baseURL}/api/notifications/subscriptions`, {
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
    data: { endpoint },
  });

const listNotifications = (params) =>
  axios.get(`${baseURL}/api/notifications`, {
    headers: authHeader(),
    params,
  });

const getUnreadCount = () =>
  axios.get(`${baseURL}/api/notifications/unread-count`, {
    headers: authHeader(),
  });

const markRead = (id) =>
  axios.post(
    `${baseURL}/api/notifications/${id}/read`,
    {},
    {
      headers: authHeader(),
    }
  );

const markAllRead = () =>
  axios.post(
    `${baseURL}/api/notifications/read-all`,
    {},
    {
      headers: authHeader(),
    }
  );

const deleteNotification = (id) =>
  axios.delete(`${baseURL}/api/notifications/${id}`, {
    headers: authHeader(),
  });

const NotificationsService = {
  createSubscription,
  deleteSubscription,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
};

export default NotificationsService;
