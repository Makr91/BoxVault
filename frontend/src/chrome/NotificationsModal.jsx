import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Form, Modal } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import {
  FaArrowUpRightFromSquare,
  FaBell,
  FaCheck,
  FaDesktop,
  FaEnvelope,
  FaGear,
  FaPaperPlane,
  FaShieldHalved,
  FaTriangleExclamation,
  FaXmark,
} from 'react-icons/fa6';

import { useNotify } from './notices';
import { formatRelativeTime } from './relativeTime';

export const notificationsAdapterShape = PropTypes.shape({
  list: PropTypes.func.isRequired,
  unreadCount: PropTypes.func.isRequired,
  markRead: PropTypes.func.isRequired,
  markAllRead: PropTypes.func.isRequired,
  remove: PropTypes.func.isRequired,
  sendTest: PropTypes.func,
});

export const pushAdapterShape = PropTypes.shape({
  isSupported: PropTypes.func.isRequired,
  isEnabled: PropTypes.func.isRequired,
  setEnabled: PropTypes.func.isRequired,
  subscribe: PropTypes.func.isRequired,
  unsubscribe: PropTypes.func.isRequired,
  sendTest: PropTypes.func,
});

const TYPE_ICONS = {
  SECURITY: FaShieldHalved,
  OAUTH: FaShieldHalved,
  ACCOUNT: FaEnvelope,
  ADMIN: FaGear,
  SYSTEM: FaGear,
  MESSAGE: FaEnvelope,
  ALERT: FaTriangleExclamation,
};

const SEVERITY_CLASSES = {
  DANGER: 'text-danger',
  CRITICAL: 'text-danger',
  ERROR: 'text-danger',
  WARNING: 'text-warning',
  SUCCESS: 'text-success',
  INFO: 'text-body-secondary',
};

const extractEntries = data => (Array.isArray(data?.notifications) ? data.notifications : []);

const linkOf = entry =>
  typeof entry.navigate === 'string' && entry.navigate.startsWith('https://') ? entry.navigate : '';

const NotificationRow = ({ entry, onSelect, onMarkRead, onDismiss }) => {
  const { t, i18n } = useTranslation();
  const Icon = TYPE_ICONS[entry.type] || FaBell;
  const unread = !entry.readAt;

  return (
    <div className="notification-row">
      <button
        type="button"
        className="dropdown-item notification-item"
        onClick={() => onSelect(entry)}
      >
        <Icon
          className={`notification-item-icon ${SEVERITY_CLASSES[entry.severity] || 'text-body-secondary'}`}
        />
        <span className="notification-item-body">
          <span className={`notification-item-title ${unread ? 'fw-semibold' : ''}`}>
            {entry.title}
            {linkOf(entry) ? (
              <FaArrowUpRightFromSquare className="ms-1 small text-body-secondary" aria-hidden />
            ) : null}
          </span>
          {entry.body ? <span className="notification-item-text">{entry.body}</span> : null}
          <span className="notification-item-time">
            {formatRelativeTime(entry.createdAt, i18n.language)}
          </span>
        </span>
        {unread ? <span className="notification-item-dot" /> : null}
      </button>
      <span className="notification-tools">
        {unread ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => onMarkRead(entry)}
            title={t('inbox.markRead')}
            aria-label={t('inbox.markRead')}
          >
            <FaCheck />
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onDismiss(entry)}
          title={t('inbox.dismiss')}
          aria-label={t('inbox.dismiss')}
        >
          <FaXmark />
        </button>
      </span>
    </div>
  );
};

NotificationRow.propTypes = {
  entry: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    title: PropTypes.string,
    body: PropTypes.string,
    type: PropTypes.string,
    severity: PropTypes.string,
    navigate: PropTypes.string,
    createdAt: PropTypes.string,
    readAt: PropTypes.string,
  }).isRequired,
  onSelect: PropTypes.func.isRequired,
  onMarkRead: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

const TestButton = ({ label, Icon, send }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await send();
      notify('success', t('notifications.testSent'));
    } catch (error) {
      notify('danger', t('notifications.testFailed', { message: error.message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="btn btn-link btn-sm p-0 text-body-secondary"
      onClick={run}
      disabled={busy}
      title={label}
      aria-label={label}
    >
      <Icon />
    </button>
  );
};

TestButton.propTypes = {
  label: PropTypes.string.isRequired,
  Icon: PropTypes.elementType.isRequired,
  send: PropTypes.func.isRequired,
};

const PushSwitch = ({ push, enabled, onEnabledChange }) => {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  const enablePush = async () => {
    if (!push.isSupported()) {
      setFeedback(t('notifications.notSupported'));
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setFeedback(t('notifications.permissionDenied'));
      return;
    }
    await push.subscribe();
    push.setEnabled(true);
    onEnabledChange(true);
  };

  const describeError = error => {
    if (error.response?.status === 403) {
      return t('notifications.scopeMissing');
    }
    return enabled ? t('notifications.disableError') : t('notifications.enableError');
  };

  const handleToggle = async () => {
    setBusy(true);
    setFeedback('');
    try {
      if (enabled) {
        await push.unsubscribe();
        push.setEnabled(false);
        onEnabledChange(false);
      } else {
        await enablePush();
      }
    } catch (error) {
      setFeedback(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="d-flex flex-column">
      <Form.Check
        type="switch"
        id="push-switch"
        label={t('notifications.pushSwitch')}
        checked={enabled}
        disabled={busy}
        onChange={handleToggle}
      />
      {feedback ? <small className="text-danger">{feedback}</small> : null}
    </span>
  );
};

PushSwitch.propTypes = {
  push: pushAdapterShape.isRequired,
  enabled: PropTypes.bool.isRequired,
  onEnabledChange: PropTypes.func.isRequired,
};

const NotificationsModal = ({ show, onHide, onUnreadDelta, notifications, push, viewAllUrl }) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const [entries, setEntries] = useState([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(push.isEnabled);

  useEffect(() => {
    if (!show) {
      return;
    }
    notifications
      .list({ page: 0, size: 20 })
      .then(data => {
        setLoadFailed(false);
        setEntries(extractEntries(data));
      })
      .catch(() => setLoadFailed(true));
  }, [show, notifications]);

  const markRead = async entry => {
    if (entry.readAt) {
      return;
    }
    try {
      await notifications.markRead(entry.id);
      onUnreadDelta(-1);
      setEntries(prev =>
        prev.map(item =>
          item.id === entry.id ? { ...item, readAt: new Date().toISOString() } : item
        )
      );
    } catch {
      notify('danger', t('inbox.markReadError'));
    }
  };

  const handleSelect = async entry => {
    await markRead(entry);
    const link = linkOf(entry);
    if (link) {
      window.location.assign(link);
    }
  };

  const handleDismiss = async entry => {
    try {
      await notifications.remove(entry.id);
      setEntries(prev => prev.filter(item => item.id !== entry.id));
      if (!entry.readAt) {
        onUnreadDelta(-1);
      }
    } catch {
      notify('danger', t('inbox.dismissError'));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notifications.markAllRead();
      onUnreadDelta(-Infinity);
      setEntries(prev =>
        prev.map(item => (item.readAt ? item : { ...item, readAt: new Date().toISOString() }))
      );
    } catch {
      notify('danger', t('inbox.markAllReadError'));
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered dialogClassName="notifications-modal">
      <Modal.Header closeButton>
        <Modal.Title as="h5" className="flex-grow-1">
          {t('inbox.channelTitle')}
        </Modal.Title>
        <button type="button" className="btn btn-link btn-sm p-0 me-3" onClick={handleMarkAllRead}>
          {t('inbox.markAllRead')}
        </button>
      </Modal.Header>
      <Modal.Body className="p-0">
        {loadFailed ? <p className="small text-danger m-3">{t('inbox.loadError')}</p> : null}
        {!loadFailed && entries.length === 0 ? (
          <p className="small text-body-secondary m-3">{t('inbox.empty')}</p>
        ) : null}
        <div className="notification-list">
          {entries.map(entry => (
            <NotificationRow
              key={entry.id}
              entry={entry}
              onSelect={handleSelect}
              onMarkRead={markRead}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between align-items-center flex-nowrap gap-3 small">
        <PushSwitch push={push} enabled={pushEnabled} onEnabledChange={setPushEnabled} />
        <span className="d-flex align-items-center gap-3">
          {push.sendTest && pushEnabled ? (
            <TestButton
              label={t('notifications.testToast')}
              Icon={FaDesktop}
              send={push.sendTest}
            />
          ) : null}
          {notifications.sendTest ? (
            <TestButton
              label={t('notifications.testChannel')}
              Icon={FaPaperPlane}
              send={notifications.sendTest}
            />
          ) : null}
          {viewAllUrl ? (
            <a href={viewAllUrl} target="_blank" rel="noopener noreferrer" className="text-nowrap">
              {t('inbox.viewAll')}
              <FaArrowUpRightFromSquare className="ms-2" />
            </a>
          ) : null}
        </span>
      </Modal.Footer>
    </Modal>
  );
};

NotificationsModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  onUnreadDelta: PropTypes.func.isRequired,
  notifications: notificationsAdapterShape.isRequired,
  push: pushAdapterShape.isRequired,
  viewAllUrl: PropTypes.string.isRequired,
};

export default NotificationsModal;
