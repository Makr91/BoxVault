const urlBase64ToUint8Array = base64String => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
};

const matchesVapidKey = (subscription, vapidKey) => {
  const current = subscription.options?.applicationServerKey;
  if (!current) {
    return false;
  }
  const expected = urlBase64ToUint8Array(vapidKey);
  const actual = new Uint8Array(current);
  return (
    actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
  );
};

/**
 * Browser push subscriptions behind the notifications switch, the same in
 * every estate app; the app supplies only how it reaches its server.
 *
 * @param {Object} transport - The app's side of the subscription
 * @param {string} transport.storageKey - localStorage key remembering the switch
 * @param {() => Promise<string>} transport.getVapidKey - Resolves the server's public VAPID key
 * @param {(subscription: Object) => Promise<unknown>} transport.createSubscription - Registers a subscription JSON with the server
 * @param {(endpoint: string) => Promise<unknown>} transport.deleteSubscription - Removes a subscription by endpoint
 * @param {string} [transport.serviceWorkerUrl] - The notification service worker, /notification-sw.js by default
 * @returns {Object} The push functions the chrome's push adapter and the app's session hooks call
 */
export const createPush = ({
  storageKey,
  getVapidKey,
  createSubscription,
  deleteSubscription,
  serviceWorkerUrl = '/notification-sw.js',
}) => {
  const isPushSupported = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  const isPushEnabled = () => localStorage.getItem(storageKey) === 'true';

  const setPushEnabled = enabled => {
    if (enabled) {
      localStorage.setItem(storageKey, 'true');
    } else {
      localStorage.removeItem(storageKey);
    }
  };

  const ensureServiceWorker = async () => {
    await navigator.serviceWorker.register(serviceWorkerUrl);
    return navigator.serviceWorker.ready;
  };

  const subscribePush = async () => {
    const registration = await ensureServiceWorker();
    const vapidKey = await getVapidKey();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    await createSubscription(subscription.toJSON());
    return subscription;
  };

  const unsubscribePush = async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
      return;
    }
    await deleteSubscription(subscription.endpoint);
    await subscription.unsubscribe();
  };

  /**
   * Re-register the browser's subscription with the server on every signed-in
   * load, replacing it when the server's VAPID key has rotated and clearing
   * the switch when the browser has dropped it.
   * @returns {Promise<boolean>} Whether a subscription is registered afterwards
   */
  const syncSubscription = async () => {
    if (!isPushEnabled() || !isPushSupported()) {
      return false;
    }
    const registration = await ensureServiceWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      setPushEnabled(false);
      return false;
    }
    const vapidKey = await getVapidKey();
    if (!matchesVapidKey(subscription, vapidKey)) {
      await subscription.unsubscribe();
      await subscribePush();
      return true;
    }
    await createSubscription(subscription.toJSON());
    return true;
  };

  const listenForSubscriptionChange = onError => {
    if (!isPushSupported()) {
      return () => {};
    }
    const handleMessage = async event => {
      if (event.data?.type !== 'pushsubscriptionchange') {
        return;
      }
      try {
        if (event.data.oldEndpoint) {
          await deleteSubscription(event.data.oldEndpoint);
        }
        await syncSubscription();
      } catch (error) {
        onError(error);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleMessage);
  };

  return {
    isPushSupported,
    isPushEnabled,
    setPushEnabled,
    subscribePush,
    unsubscribePush,
    syncSubscription,
    listenForSubscriptionChange,
  };
};
