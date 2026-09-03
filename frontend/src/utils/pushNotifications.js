import { createPush } from '../chrome';
import NotificationsService from '../services/notifications.service';

const getVapidKey = async () => {
  const response = await fetch(`${window.location.origin}/api/notifications/vapid-key`);
  if (!response.ok) {
    throw new Error(`VAPID key request failed with status ${response.status}`);
  }
  const data = await response.json();
  return data.publicKey;
};

export const {
  isPushSupported,
  isPushEnabled,
  setPushEnabled,
  subscribePush,
  unsubscribePush,
  syncSubscription,
  listenForSubscriptionChange,
} = createPush({
  storageKey: 'boxvault_push_enabled',
  getVapidKey,
  createSubscription: subscription => NotificationsService.createSubscription(subscription),
  deleteSubscription: endpoint => NotificationsService.deleteSubscription(endpoint),
});
