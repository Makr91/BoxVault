import NotificationsService from "../services/notifications.service";

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

const getVapidKey = async () => {
  const response = await fetch(
    `${window.location.origin}/api/notifications/vapid-key`
  );

  if (!response.ok) {
    throw new Error(`VAPID key request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.publicKey;
};

const subscribePush = async () => {
  const registration = await ensureServiceWorker();
  const vapidKey = await getVapidKey();
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

const matchesVapidKey = (subscription, vapidKey) => {
  const current = subscription.options?.applicationServerKey;

  if (!current) {
    return false;
  }

  const expected = urlBase64ToUint8Array(vapidKey);
  const actual = new Uint8Array(current);
  return (
    actual.length === expected.length &&
    actual.every((byte, index) => byte === expected[index])
  );
};

const syncSubscription = async () => {
  const registration = await ensureServiceWorker();
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return false;
  }

  // A push subscription is bound to the applicationServerKey it was created
  // with, so one minted against a different key can never receive a message —
  // it has to be replaced rather than re-registered.
  const vapidKey = await getVapidKey();
  if (!matchesVapidKey(subscription, vapidKey)) {
    await subscription.unsubscribe();
    await subscribePush();
    return true;
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
