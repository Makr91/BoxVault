import axios from 'axios';

const INBOX = '/api/notifications';

/**
 * The notification-hub inbox client behind the user menu's bell, the same
 * five calls in every estate app; the app supplies only where the hub's
 * `/api/notifications` routes answer for its browser (the IdP itself when
 * the browser holds an IdP token, the app's own backend when that backend
 * proxies) and the headers one request carries.
 *
 * @param {Object} transport - The app's side of the inbox
 * @param {string} transport.baseUrl - Origin the inbox paths are appended to, empty for same-origin
 * @param {(method: string, path: string) => (Object|Promise<Object>)} transport.headers - Auth headers for one request, given its method and path
 * @returns {{ list: Function, unreadCount: Function, markRead: Function, markAllRead: Function, remove: Function }} The adapter `NotificationsItem` and `NotificationsModal` read
 */
export const createNotificationsClient = ({ baseUrl, headers }) => {
  const request = async (method, path, options = {}) => {
    const { data } = await axios.request({
      method,
      url: `${baseUrl}${path}`,
      headers: await headers(method, path),
      ...options,
    });
    return data;
  };

  return {
    list: params => request('GET', INBOX, { params }),
    unreadCount: () => request('GET', `${INBOX}/unread-count`),
    markRead: id => request('POST', `${INBOX}/${encodeURIComponent(id)}/read`),
    markAllRead: () => request('POST', `${INBOX}/read-all`),
    remove: id => request('DELETE', `${INBOX}/${encodeURIComponent(id)}`),
  };
};
