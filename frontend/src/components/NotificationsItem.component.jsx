import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaBell } from 'react-icons/fa6';

import NotificationsService from '../services/notifications.service';
import { log } from '../utils/Logger';

import NotificationsModal from './NotificationsModal.component';

const UNREAD_POLL_MS = 60000;

const NotificationsItem = ({ authServerUrl }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;

    const loadUnreadCount = async () => {
      try {
        const response = await NotificationsService.getUnreadCount();
        if (active) {
          setUnreadCount(response.data?.count || 0);
        }
      } catch (error) {
        log.api.error('Error loading unread notification count', {
          error: error.message,
        });
      }
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, UNREAD_POLL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const adjustUnread = delta => {
    setUnreadCount(count => (delta === -Infinity ? 0 : Math.max(0, count + delta)));
  };

  return (
    <>
      <li>
        <button
          type="button"
          className="dropdown-item d-flex align-items-center"
          onClick={() => setShow(true)}
        >
          <FaBell className="me-2" />
          <span className="flex-grow-1">{t('inbox.title')}</span>
          {unreadCount > 0 && (
            <span className="badge rounded-pill bg-danger ms-2">{unreadCount}</span>
          )}
        </button>
      </li>
      <NotificationsModal
        show={show}
        onHide={() => setShow(false)}
        authServerUrl={authServerUrl}
        onUnreadDelta={adjustUnread}
      />
    </>
  );
};

NotificationsItem.propTypes = {
  authServerUrl: PropTypes.string,
};

export default NotificationsItem;
