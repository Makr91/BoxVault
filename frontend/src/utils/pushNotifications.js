import NotificationsService from "../services/notifications.service";

import { resolveAuthServerUrl } from "./authServer";

const PUSH_ENABLED_KEY = "boxvault_push_enabled";

const isPushSupported = () =>
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

const isPushEnabled = () => localStorage.getItem(PUSH_ENABLED_KEY) === "true";

const setPushEnabled = (enabled) => {
  if (enabled) {
    localStorage.setItem(PUSH_ENABLED_KEY, "true");
  } else {
    localStorage.removeItem(PUSH_ENABLED_KEY);
  }
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
};

const ensureServiceWorker = async () => {
  await navigator.serviceWorker.register("/notification-sw.js");
  return navigator.serviceWorker.ready;
};

const getVapidKey = async (accessToken) => {
  const authServerUrl = await resolveAuthServerUrl(accessToken);

  if (!authServerUrl) {
    throw new Error("Could not resolve a trusted auth server URL");
  }

  const response = await fetch(`${authServerUrl}/api/notifications/vapid-key`);

  if (!response.ok) {
    throw new Error(`VAPID key request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.publicKey;
};

const subscribePush = async (accessToken) => {
  const registration = await ensureServiceWorker();
  const vapidKey = await getVapidKey(accessToken);
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });
  await NotificationsService.createSubscription(subscription.toJSON());
  return subscription;
};

const unsubscribePush = async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (!subscription) {
    return;
  }

  await NotificationsService.deleteSubscription(subscription.endpoint);
  await subscription.unsubscribe();
};

const syncSubscription = async () => {
  const registration = await ensureServiceWorker();
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return false;
  }

  await NotificationsService.createSubscription(subscription.toJSON());
  return true;
};

export {
  isPushSupported,
  isPushEnabled,
  setPushEnabled,
  urlBase64ToUint8Array,
  ensureServiceWorker,
  getVapidKey,
  subscribePush,
  unsubscribePush,
  syncSubscription,
};
