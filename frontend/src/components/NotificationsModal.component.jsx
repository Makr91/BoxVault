import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import { Modal, Form } from "react-bootstrap";
import { useTranslation } from "react-i18next";
import {
  FaBell,
  FaGear,
  FaEnvelope,
  FaTriangleExclamation,
  FaShieldHalved,
  FaXmark,
  FaArrowUpRightFromSquare,
} from "react-icons/fa6";

import NotificationsService from "../services/notifications.service";
import { log } from "../utils/Logger";
import {
  isPushSupported,
  isPushEnabled,
  setPushEnabled,
  subscribePush,
  unsubscribePush,
} from "../utils/pushNotifications";
import { formatRelativeTime } from "../utils/relativeTime";

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
  DANGER: "text-danger",
  CRITICAL: "text-danger",
  ERROR: "text-danger",
  WARNING: "text-warning",
  SUCCESS: "text-success",
  INFO: "text-body-secondary",
};

const extractEntries = (data) =>
  Array.isArray(data?.notifications) ? data.notifications : [];

const NotificationRow = ({ entry, onSelect, onDismiss }) => {
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
          className={`notification-item-icon ${
            SEVERITY_CLASSES[entry.severity] || "text-body-secondary"
          }`}
        />
        <span className="notification-item-body">
          <span
            className={`notification-item-title ${unread ? "fw-semibold" : ""}`}
          >
            {entry.title}
          </span>
          {entry.body && (
            <span className="notification-item-text">{entry.body}</span>
          )}
          <span className="notification-item-time">
            {formatRelativeTime(entry.createdAt, i18n.language)}
          </span>
        </span>
        {unread && <span className="notification-item-dot" />}
      </button>
      <button
        type="button"
        className="btn btn-sm notification-dismiss"
        onClick={() => onDismiss(entry)}
        title={t("inbox.dismiss")}
        aria-label={t("inbox.dismiss")}
      >
        <FaXmark />
      </button>
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
  onDismiss: PropTypes.func.isRequired,
};

const PushSwitch = () => {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(isPushEnabled());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  const enablePush = async () => {
    if (!isPushSupported()) {
      setFeedback(t("notifications.notSupported"));
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setFeedback(t("notifications.permissionDenied"));
      return;
    }
    await subscribePush();
    setPushEnabled(true);
    setEnabled(true);
  };

  const describeError = (error) => {
    if (error.response?.status === 403) {
      return t("notifications.scopeMissing");
    }
    return enabled
      ? t("notifications.disableError")
      : t("notifications.enableError");
  };

  const handleToggle = async () => {
    setBusy(true);
    setFeedback("");
    try {
      if (enabled) {
        await unsubscribePush();
        setPushEnabled(false);
        setEnabled(false);
      } else {
        await enablePush();
      }
    } catch (error) {
      log.component.error("Notification toggle failed", {
        error: error.message,
      });
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
        label={t("notifications.pushSwitch")}
        checked={enabled}
        disabled={busy}
        onChange={handleToggle}
      />
      {feedback && <small className="text-danger">{feedback}</small>}
    </span>
  );
};

const NotificationsModal = ({ show, onHide, authServerUrl, onUnreadDelta }) => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!show) {
      return;
    }
    NotificationsService.listNotifications({ page: 0, size: 20 })
      .then((response) => {
        setLoadFailed(false);
        setEntries(extractEntries(response.data));
      })
      .catch((error) => {
        log.api.error("Error loading notification inbox", {
          error: error.message,
        });
        setLoadFailed(true);
      });
  }, [show]);

  const handleSelect = async (entry) => {
    if (!entry.readAt) {
      try {
        await NotificationsService.markRead(entry.id);
        onUnreadDelta(-1);
        setEntries((prev) =>
          prev.map((item) =>
            item.id === entry.id
              ? { ...item, readAt: new Date().toISOString() }
              : item
          )
        );
      } catch (error) {
        log.api.error("Error marking notification read", {
          error: error.message,
        });
      }
    }
    if (
      typeof entry.navigate === "string" &&
      entry.navigate.startsWith("https://")
    ) {
      window.location.assign(entry.navigate);
    }
  };

  const handleDismiss = async (entry) => {
    try {
      await NotificationsService.deleteNotification(entry.id);
      setEntries((prev) => prev.filter((item) => item.id !== entry.id));
      if (!entry.readAt) {
        onUnreadDelta(-1);
      }
    } catch (error) {
      log.api.error("Error dismissing notification", {
        error: error.message,
      });
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await NotificationsService.markAllRead();
      onUnreadDelta(-Infinity);
      setEntries((prev) =>
        prev.map((item) =>
          item.readAt ? item : { ...item, readAt: new Date().toISOString() }
        )
      );
    } catch (error) {
      log.api.error("Error marking all notifications read", {
        error: error.message,
      });
      setLoadFailed(true);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title className="d-flex align-items-center gap-3">
          {t("inbox.title")}
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            onClick={handleMarkAllRead}
          >
            {t("inbox.markAllRead")}
          </button>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="p-0">
        {loadFailed && (
          <p className="small text-danger m-3">{t("inbox.loadError")}</p>
        )}
        {!loadFailed && entries.length === 0 && (
          <p className="small text-body-secondary m-3">{t("inbox.empty")}</p>
        )}
        <div className="notification-list">
          {entries.map((entry) => (
            <NotificationRow
              key={entry.id}
              entry={entry}
              onSelect={handleSelect}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <PushSwitch />
        {authServerUrl && (
          <a
            href={`${authServerUrl}/notifications`}
            target="_blank"
            rel="noopener noreferrer"
            className="small"
          >
            {t("inbox.viewAll")}
            <FaArrowUpRightFromSquare className="ms-2" />
          </a>
        )}
      </Modal.Footer>
    </Modal>
  );
};

NotificationsModal.propTypes = {
  show: PropTypes.bool.isRequired,
  onHide: PropTypes.func.isRequired,
  authServerUrl: PropTypes.string,
  onUnreadDelta: PropTypes.func.isRequired,
};

export default NotificationsModal;
