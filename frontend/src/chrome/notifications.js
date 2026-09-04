import { encodePath } from './apiClient';

const INBOX = '/api/notifications';

/**
 * The notification-hub inbox client behind the user menu's bell, the same
 * five calls in every estate app; the app supplies only the API client
 * whose base is where the hub's `/api/notifications` routes answer for its
 * browser (the IdP itself when the browser holds an IdP token, the app's
 * own backend when that backend proxies).
 *
 * @param {Object} transport - The app's side of the inbox
 * @param {Object} transport.client - An API client from `createApiClient` based at the hub
 * @returns {{ list: Function, unreadCount: Function, markRead: Function, markAllRead: Function, remove: Function }} The adapter `NotificationsItem` and `NotificationsModal` read
 */
export const createNotificationsClient = ({ client }) => ({
  list: params => client.get(INBOX, { params }),
  unreadCount: () => client.get(`${INBOX}/unread-count`),
  markRead: id => client.post(`${INBOX}${encodePath(id)}/read`),
  markAllRead: () => client.post(`${INBOX}/read-all`),
  remove: id => client.delete(`${INBOX}${encodePath(id)}`),
});
