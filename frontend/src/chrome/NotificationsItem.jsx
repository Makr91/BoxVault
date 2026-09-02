import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBell } from 'react-icons/fa6';

import NotificationsModal, {
  notificationsAdapterShape,
  pushAdapterShape,
} from './NotificationsModal';

const UNREAD_POLL_MS = 60000;

const NotificationsItem = ({ notifications, push, viewAllUrl = '' }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const load = () => {
      notifications
        .unreadCount()
        .then(data => setUnread(data?.count || 0))
        .catch(() => null);
    };
    load();
    const interval = setInterval(load, UNREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [notifications]);

  const adjustUnread = delta => {
    setUnread(count => (delta === -Infinity ? 0 : Math.max(0, count + delta)));
  };

  return (
    <>
      <Dropdown.Item
        as="button"
        type="button"
        onClick={() => setShow(true)}
        className="d-flex align-items-center"
      >
        <FaBell className="me-2" />
        <span className="flex-grow-1">{t('inbox.title')}</span>
        {unread > 0 ? <span className="badge rounded-pill bg-danger ms-2">{unread}</span> : null}
      </Dropdown.Item>
      <NotificationsModal
        show={show}
        onHide={() => setShow(false)}
        onUnreadDelta={adjustUnread}
        notifications={notifications}
        push={push}
        viewAllUrl={viewAllUrl}
      />
    </>
  );
};

NotificationsItem.propTypes = {
  notifications: notificationsAdapterShape.isRequired,
  push: pushAdapterShape.isRequired,
  viewAllUrl: PropTypes.string,
};

export default NotificationsItem;
