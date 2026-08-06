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

const NotificationsService = {
  createSubscription,
  deleteSubscription,
};

export default NotificationsService;
