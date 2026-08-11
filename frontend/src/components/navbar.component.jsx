import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import CountryFlag from "react-country-flag";
import { useTranslation } from "react-i18next";
import {
  FaMoon,
  FaSun,
  FaTicket,
  FaUser,
  FaCircleInfo,
  FaGear,
  FaIdBadge,
  FaHouseLock,
  FaBridgeLock,
  FaBook,
  FaBell,
  FaBellSlash,
  FaShieldHalved,
  FaEnvelope,
  FaTriangleExclamation,
  FaXmark,
  FaArrowUpRightFromSquare,
  FaCircleHalfStroke,
} from "react-icons/fa6";
import { Link } from "react-router-dom";

import { getSupportedLanguages } from "../i18n";
import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import FavoritesService from "../services/favorites.service";
import NotificationsService from "../services/notifications.service";
import UserService from "../services/user.service";
import { fetchTrustedIssuers, resolveIssuer } from "../utils/authServer";
import { userDisplayName } from "../utils/displayName";
import { log } from "../utils/Logger";
import {
  isPushSupported,
  isPushEnabled,
  setPushEnabled,
  subscribePush,
  unsubscribePush,
} from "../utils/pushNotifications";
import { formatRelativeTime } from "../utils/relativeTime";

import OrganizationSwitcher from "./OrganizationSwitcher.component";

// Helper to get language display name
const getLanguageDisplayName = (languageCode) => {
  const code = languageCode || "en";

  if (code === "cimode") {
    return "CI/CD Mode";
  }

  try {
    const displayNames = new Intl.DisplayNames([code], { type: "language" });
    const name = displayNames.of(code);
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
};

const AppIcon = ({ app }) => {
  if (app.iconUrl && app.iconUrl !== "") {
    return (
      <img
        src={app.iconUrl}
        className="logo-md icon-with-margin"
        alt=""
        onError={(e) => {
          e.target.style.display = "none";
        }}
      />
    );
  }

  // Note: Favicon logic removed from here to simplify, or can be kept if needed.
  // For simplicity and complexity reduction, we'll rely on the parent or simplify this component.
  // Re-implementing the logic from renderAppIcon:

  if (app.homeUrl && app.homeUrl !== "") {
    let faviconUrl = null;
    try {
      faviconUrl = `${new URL(app.homeUrl).origin}/favicon.ico`;
    } catch (e) {
      log.component.debug("Invalid URL for favicon", {
        url: app.homeUrl,
        error: e.message,
      });
    }

    if (faviconUrl) {
      return (
        <img
          src={faviconUrl}
          className="logo-md icon-with-margin"
          alt=""
          onError={(e) => {
            e.target.style.display = "none";
          }}
        />
      );
    }
  }

  return null;
};

AppIcon.propTypes = {
  app: PropTypes.shape({
    iconUrl: PropTypes.string,
    homeUrl: PropTypes.string,
  }).isRequired,
};

const NotificationToggle = () => {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(isPushEnabled());
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const enableNotifications = async () => {
    if (!isPushSupported()) {
      setFeedback({ tone: "danger", text: t("notifications.notSupported") });
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setFeedback({
        tone: "danger",
        text: t("notifications.permissionDenied"),
      });
      return;
    }

    await subscribePush();
    setPushEnabled(true);
    setEnabled(true);
    setFeedback({ tone: "success", text: t("notifications.enableSuccess") });
  };

  const disableNotifications = async () => {
    await unsubscribePush();
    setPushEnabled(false);
    setEnabled(false);
    setFeedback({ tone: "success", text: t("notifications.disableSuccess") });
  };

  const describeToggleError = (error) => {
    if (error.response?.status === 403) {
      return t("notifications.scopeMissing");
    }
    return enabled
      ? t("notifications.disableError")
      : t("notifications.enableError");
  };

  const handleToggle = async (e) => {
    e.stopPropagation();
    setBusy(true);
    setFeedback(null);

    try {
      if (enabled) {
        await disableNotifications();
      } else {
        await enableNotifications();
      }
    } catch (error) {
      log.component.error("Notification toggle failed", {
        error: error.message,
      });
      setFeedback({ tone: "danger", text: describeToggleError(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <li>
        <button
          type="button"
          className="dropdown-item d-flex align-items-center"
          onClick={handleToggle}
          disabled={busy}
        >
          {enabled ? (
            <FaBell className="me-2" />
          ) : (
            <FaBellSlash className="me-2" />
          )}
          {enabled ? t("notifications.disable") : t("notifications.enable")}
        </button>
      </li>
      {feedback && (
        <li>
          <span className={`dropdown-item-text small text-${feedback.tone}`}>
            {feedback.text}
          </span>
        </li>
      )}
    </>
  );
};

const extractInboxEntries = (data) =>
  Array.isArray(data?.notifications) ? data.notifications : [];

const INBOX_TYPE_ICONS = {
  SECURITY: FaShieldHalved,
  SYSTEM: FaGear,
  MESSAGE: FaEnvelope,
  ALERT: FaTriangleExclamation,
};

const INBOX_SEVERITY_CLASSES = {
  CRITICAL: "text-danger",
  ERROR: "text-danger",
  WARNING: "text-warning",
  SUCCESS: "text-success",
  INFO: "text-body-secondary",
};

const NotificationInboxItem = ({ entry, onSelect, onDismiss }) => {
  const { t, i18n } = useTranslation();
  const Icon = INBOX_TYPE_ICONS[entry.type] || FaBell;
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
            INBOX_SEVERITY_CLASSES[entry.severity] || "text-body-secondary"
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

NotificationInboxItem.propTypes = {
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

const NotificationBell = ({ authServerUrl }) => {
  const { t } = useTranslation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [entries, setEntries] = useState([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let active = true;

    const loadUnreadCount = async () => {
      try {
        const response = await NotificationsService.getUnreadCount();
        if (active) {
          setUnreadCount(response.data?.count || 0);
        }
      } catch (error) {
        log.api.error("Error loading unread notification count", {
          error: error.message,
        });
      }
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 60000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const loadEntries = async () => {
    try {
      setLoadFailed(false);
      const response = await NotificationsService.listNotifications({
        page: 0,
        size: 20,
      });
      setEntries(extractInboxEntries(response.data));
    } catch (error) {
      log.api.error("Error loading notification inbox", {
        error: error.message,
      });
      setLoadFailed(true);
    }
  };

  const handleSelect = async (entry) => {
    if (!entry.readAt) {
      try {
        await NotificationsService.markRead(entry.id);
        setUnreadCount((count) => Math.max(0, count - 1));
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
        setUnreadCount((count) => Math.max(0, count - 1));
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
      setUnreadCount(0);
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
    <li className="nav-item dropdown">
      <button
        className="nav-link"
        id="notificationBellDropdown"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        onClick={loadEntries}
        title={t("inbox.title")}
        aria-label={t("inbox.unreadCount", { count: unreadCount })}
      >
        <span className="position-relative">
          <FaBell />
          {unreadCount > 0 && (
            <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
              {unreadCount}
            </span>
          )}
        </span>
      </button>
      <ul
        className="dropdown-menu dropdown-menu-end overflow-auto notification-menu"
        aria-labelledby="notificationBellDropdown"
      >
        <li className="d-flex justify-content-between align-items-center notification-header">
          <strong>{t("inbox.title")}</strong>
          <button
            type="button"
            className="btn btn-sm btn-link p-0"
            onClick={handleMarkAllRead}
          >
            {t("inbox.markAllRead")}
          </button>
        </li>
        <li>
          <hr className="dropdown-divider m-0" />
        </li>
        {loadFailed && (
          <li>
            <span className="dropdown-item-text small text-danger">
              {t("inbox.loadError")}
            </span>
          </li>
        )}
        {!loadFailed && entries.length === 0 && (
          <li>
            <span className="dropdown-item-text small text-body-secondary">
              {t("inbox.empty")}
            </span>
          </li>
        )}
        {entries.map((entry) => (
          <li key={entry.id}>
            <NotificationInboxItem
              entry={entry}
              onSelect={handleSelect}
              onDismiss={handleDismiss}
            />
          </li>
        ))}
        {authServerUrl && (
          <li className="notification-footer">
            <a
              href={`${authServerUrl}/notifications`}
              target="_blank"
              rel="noopener noreferrer"
              className="dropdown-item text-center"
            >
              {t("inbox.viewAll")}
              <FaArrowUpRightFromSquare className="ms-2" />
            </a>
          </li>
        )}
      </ul>
    </li>
  );
};

NotificationBell.propTypes = {
  authServerUrl: PropTypes.string,
};

const BrandLogo = ({ theme, className }) =>
  theme === "light" ? (
    <BoxVaultLight className={className} />
  ) : (
    <BoxVaultDark className={className} />
  );

BrandLogo.propTypes = {
  theme: PropTypes.string.isRequired,
  className: PropTypes.string.isRequired,
};

const ProfileMenuItem = ({
  profileIsLocal,
  authServerUrl,
  onToggle,
  onToggleKeyPress,
}) => {
  const { t } = useTranslation();
  const icon = (
    <span
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(e);
      }}
      onKeyPress={onToggleKeyPress}
      role="button"
      tabIndex={0}
      title="Switch profile mode"
      className="cursor-pointer"
    >
      {profileIsLocal ? (
        <FaUser className="me-2" />
      ) : (
        <FaIdBadge className="me-2" />
      )}
    </span>
  );
  if (profileIsLocal || !authServerUrl) {
    return (
      <Link to="/profile" className="dropdown-item d-flex align-items-center">
        {icon}
        {t("navbar.profile")}
      </Link>
    );
  }
  return (
    <a
      href={`${authServerUrl}/user/profile`}
      target="_blank"
      rel="noopener noreferrer"
      className="dropdown-item d-flex align-items-center"
    >
      {icon}
      {t("navbar.profile")}
    </a>
  );
};

ProfileMenuItem.propTypes = {
  profileIsLocal: PropTypes.bool.isRequired,
  authServerUrl: PropTypes.string.isRequired,
  onToggle: PropTypes.func.isRequired,
  onToggleKeyPress: PropTypes.func.isRequired,
};

const Navbar = ({
  currentUser,
  gravatarUrl,
  showAdminBoard,
  showOrgConsole,
  theme,
  themePreference,
  toggleTheme,
  logOut,
  logOutLocal,
  activeOrganization,
  onOrganizationSwitch,
}) => {
  const { t, i18n } = useTranslation();
  const themeIcons = { auto: FaCircleHalfStroke, light: FaSun, dark: FaMoon };
  const ThemeIcon = themeIcons[themePreference] || FaCircleHalfStroke;
  const themeToggleLabel = t(`theme.${themePreference}`);
  const [logoutEverywhere, setLogoutEverywhere] = useState(true);
  const [profileIsLocal, setProfileIsLocal] = useState(true);
  const [favoriteApps, setFavoriteApps] = useState([]);
  const [userClaims, setUserClaims] = useState(null);
  const [ticketConfig, setTicketConfig] = useState(null);
  const [authServerUrl, setAuthServerUrl] = useState("");
  const [trustedIssuers, setTrustedIssuers] = useState([]);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [activeOrgGravatar, setActiveOrgGravatar] = useState(null);
  const [activeOrgCode, setActiveOrgCode] = useState(null);

  const changeLanguage = async (lng) => {
    if (currentUser) {
      UserService.updatePreferences({ language: lng })
        .then(() => {
          // Keep the stored session in step, or the next mount would re-apply
          // the language this choice just replaced.
          const stored = AuthService.getCurrentUser();
          if (stored) {
            localStorage.setItem(
              "user",
              JSON.stringify({ ...stored, preferredLanguage: lng })
            );
          }
        })
        .catch((error) => {
          log.component.error("Language preference not saved", {
            error: error.message,
          });
        });
    }

    log.component.debug("Changing language", {
      from: i18n.language,
      to: lng,
      currentLocalStorage: localStorage.getItem("i18nextLng"),
    });

    await i18n.changeLanguage(lng);

    log.component.debug("Language changed", {
      newLanguage: i18n.language,
      localStorage: localStorage.getItem("i18nextLng"),
    });

    setShowLanguageModal(false);
  };

  // Get flag icon for language
  const getLanguageFlag = (languageCode) => {
    const code = languageCode || "en";

    if (code === "cimode") {
      return "🔧";
    }

    try {
      const locale = new Intl.Locale(code);
      const region = locale.region || locale.maximize().region;

      if (region) {
        return <CountryFlag countryCode={region} svg title={region} />;
      }
    } catch {
      // Ignore errors
    }

    return "🌐";
  };

  // Get supported languages from i18n
  const supportedLanguages = getSupportedLanguages();

  const handleLogout = () => {
    if (currentUser?.provider?.startsWith("oidc-") && logoutEverywhere) {
      logOut();
    } else {
      logOutLocal();
    }
  };

  const handleLogoutToggle = (e) => {
    e.stopPropagation();
    setLogoutEverywhere(!logoutEverywhere);
  };

  const handleProfileToggle = (e) => {
    e.stopPropagation();
    setProfileIsLocal(!profileIsLocal);
  };

  const handleLogoutToggleKeyPress = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleLogoutToggle(e);
    }
  };

  const handleProfileToggleKeyPress = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleProfileToggle(e);
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadTrustedIssuers = async () => {
      try {
        const issuers = await fetchTrustedIssuers();
        if (mounted) {
          setTrustedIssuers(issuers);
          log.auth.debug("Trusted issuers loaded", { count: issuers.length });
        }
      } catch (error) {
        log.auth.error("Failed to load trusted issuers", {
          error: error.message,
        });
        if (mounted) {
          setTrustedIssuers([]);
        }
      }
    };

    loadTrustedIssuers();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const loadUserData = async () => {
      if (currentUser?.provider?.startsWith("oidc-")) {
        try {
          const response = await FavoritesService.getUserInfoClaims();
          if (mounted) {
            setUserClaims(response.data);
            setFavoriteApps(response.data?.favorite_apps || []);
          }
        } catch (error) {
          if (
            !error.name?.includes("Cancel") &&
            !error.message?.includes("aborted")
          ) {
            log.api.error("Error loading user claims", {
              error: error.message,
            });
          }
        }
      } else {
        setFavoriteApps([]);
        setUserClaims(null);
      }
    };

    loadUserData();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [currentUser]);

  const extractAuthServerUrl = useCallback(
    (accessToken) => resolveIssuer(accessToken, trustedIssuers),
    [trustedIssuers]
  );

  const fetchTicketConfig = useCallback(async (mounted) => {
    try {
      const response = await fetch(
        `${window.location.origin}/api/config/ticket`
      );
      if (response.ok) {
        const data = await response.json();
        if (mounted && data?.ticket_system) {
          setTicketConfig(data.ticket_system);
        }
      }
    } catch (error) {
      log.api.error("Error fetching ticket config", { error: error.message });
    }
  }, []);

  const fetchOrgGravatar = useCallback(async (org, user, mounted) => {
    try {
      const response = await fetch(
        `${window.location.origin}/api/organization/${org}`,
        {
          headers: { "x-access-token": user.accessToken },
        }
      );
      if (!response.ok) {
        return;
      }

      const orgData = await response.json();

      if (mounted) {
        setActiveOrgCode(
          orgData.external_issuer ? orgData.org_code || null : null
        );
      }

      // Stored org logo wins; the Gravatar email-hash fetch stays as fallback
      if (orgData.logo && mounted) {
        setActiveOrgGravatar(orgData.logo);
        return;
      }

      if (!orgData.emailHash || !mounted) {
        return;
      }

      const profile = await AuthService.getGravatarProfile(orgData.emailHash);
      if (profile?.avatar_url && mounted) {
        setActiveOrgGravatar(profile.avatar_url);
      }
    } catch (error) {
      log.api.error("Error fetching active org gravatar", {
        error: error.message,
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadConfigs = async () => {
      await fetchTicketConfig(mounted);

      if (
        trustedIssuers.length > 0 &&
        currentUser?.provider?.startsWith("oidc-") &&
        currentUser?.accessToken
      ) {
        const issuerUrl = extractAuthServerUrl(currentUser.accessToken);
        if (issuerUrl && mounted) {
          setAuthServerUrl(issuerUrl);
        }
      }

      if (activeOrganization && currentUser) {
        await fetchOrgGravatar(activeOrganization, currentUser, mounted);
      }
    };

    loadConfigs();

    return () => {
      mounted = false;
    };
  }, [
    currentUser,
    extractAuthServerUrl,
    trustedIssuers,
    activeOrganization,
    fetchTicketConfig,
    fetchOrgGravatar,
  ]);

  // Helper to get customer ID with priority logic
  const getCustomerId = useCallback(
    () => activeOrgCode || userClaims?.customer_id || "A55DF1",
    [userClaims, activeOrgCode]
  );

  // Helper to get user name from claims or current user
  const getUserName = useCallback(
    () => userClaims?.name || userDisplayName(currentUser) || "User",
    [userClaims, currentUser]
  );

  // Helper to get email from claims or current user
  const getUserEmail = useCallback(
    () => userClaims?.email || currentUser?.email || "",
    [userClaims, currentUser]
  );

  const buildTicketUrl = useCallback(() => {
    if (!ticketConfig || !ticketConfig.enabled?.value) {
      return null;
    }

    const baseUrl = ticketConfig.base_url?.value || "";
    const req = ticketConfig.req_type?.value || "sso";
    const context = ticketConfig.context?.value || "";

    const params = new URLSearchParams({
      req,
      customerId: getCustomerId(),
      user: getUserName(),
      email: getUserEmail(),
      context,
    });

    return `${baseUrl}&${params.toString()}`;
  }, [ticketConfig, getCustomerId, getUserName, getUserEmail]);

  const ticketUrl = buildTicketUrl();

  const handleFavoriteClick = (app, event) => {
    event.preventDefault();
    if (app.homeUrl && app.homeUrl !== "") {
      window.open(app.homeUrl, "_blank", "noopener,noreferrer");
    }
  };

  const renderUserAvatar = () => {
    if (gravatarUrl) {
      return (
        <img
          src={gravatarUrl}
          alt="User Avatar"
          className="rounded-circle avatar-lg icon-with-margin-sm v-align-middle"
        />
      );
    }

    const LogoComponent = theme === "light" ? BoxVaultLight : BoxVaultDark;
    return <LogoComponent className="logo-xl icon-with-margin-sm" />;
  };

  const renderOrgIcon = () => {
    if (activeOrgGravatar) {
      return (
        <img
          src={activeOrgGravatar}
          alt=""
          className="rounded-circle avatar-sm me-2"
        />
      );
    }
    const LogoComponent = theme === "light" ? BoxVaultLight : BoxVaultDark;
    return <LogoComponent className="logo-sm me-2" />;
  };

  const renderLogoutIcon = () => {
    if (currentUser?.provider?.startsWith("oidc-")) {
      if (logoutEverywhere) {
        return (
          <FaBridgeLock
            className="me-2 text-danger cursor-pointer"
            onClick={handleLogoutToggle}
            onKeyPress={handleLogoutToggleKeyPress}
            role="button"
            tabIndex={0}
            title="Click to logout locally only"
          />
        );
      }
      return (
        <FaHouseLock
          className="me-2 text-danger cursor-pointer"
          onClick={handleLogoutToggle}
          onKeyPress={handleLogoutToggleKeyPress}
          role="button"
          tabIndex={0}
          title="Click to logout everywhere"
        />
      );
    }
    return <FaHouseLock className="me-2 text-danger" />;
  };

  return (
    <nav className="navbar navbar-expand-lg">
      <div className="container-fluid">
        <Link to="/" className="navbar-brand">
          <BrandLogo theme={theme} className="logo-xl icon-with-margin-sm" />
          BoxVault
        </Link>
        <ul className="nav nav-pills me-auto">
          {currentUser && activeOrganization && (
            <li className="nav-item">
              <Link to={`/${activeOrganization}`} className="nav-link">
                {activeOrganization}
              </Link>
            </li>
          )}
        </ul>

        {currentUser ? (
          <ul className="nav nav-pills ms-auto">
            {currentUser?.provider?.startsWith("oidc-") && (
              <NotificationBell authServerUrl={authServerUrl} />
            )}
            <li className="nav-item dropdown">
              <button
                className="nav-link dropdown-toggle"
                id="navbarDropdown"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                {renderUserAvatar()}
                {userClaims?.name || userDisplayName(currentUser)}
              </button>
              <ul
                className="dropdown-menu dropdown-menu-end"
                aria-labelledby="navbarDropdown"
              >
                {showAdminBoard && (
                  <>
                    <li>
                      <Link to="/admin" className="dropdown-item">
                        <FaGear className="me-2" />
                        {t("navbar.admin")}
                      </Link>
                    </li>
                    <li>
                      <hr className="dropdown-divider" />
                    </li>
                  </>
                )}
                {showOrgConsole && (
                  <li>
                    <Link
                      to="/org-console"
                      className="dropdown-item d-flex align-items-center"
                    >
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowOrgModal(true);
                        }}
                        onKeyPress={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowOrgModal(true);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        title="Switch organization"
                        className="cursor-pointer"
                      >
                        {renderOrgIcon()}
                      </span>
                      {t("navbar.organization")}
                    </Link>
                  </li>
                )}
                <li>
                  <ProfileMenuItem
                    profileIsLocal={profileIsLocal}
                    authServerUrl={authServerUrl}
                    onToggle={handleProfileToggle}
                    onToggleKeyPress={handleProfileToggleKeyPress}
                  />
                </li>
                <li>
                  <Link to="/about" className="dropdown-item">
                    <FaCircleInfo className="me-2" />
                    {t("navbar.about")}
                  </Link>
                </li>
                <li>
                  <a href="/docs" className="dropdown-item">
                    <FaBook className="me-2" />
                    {t("navbar.docs")}
                  </a>
                </li>
                <NotificationToggle />
                {favoriteApps && favoriteApps.length > 0 && (
                  <>
                    <li>
                      <hr className="dropdown-divider" />
                    </li>
                    <li className="dropdown-header py-0">
                      {t("navbar.favorites")}
                    </li>
                    {favoriteApps
                      .sort((a, b) => (a.order || 0) - (b.order || 0))
                      .map((app) => (
                        <li key={app.clientId}>
                          <a
                            href={app.homeUrl || "#"}
                            onClick={(e) => handleFavoriteClick(app, e)}
                            className="dropdown-item"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <AppIcon app={app} />
                            {app.customLabel || app.clientName || app.clientId}
                          </a>
                        </li>
                      ))}
                  </>
                )}
                {ticketUrl && (
                  <>
                    <li>
                      <hr className="dropdown-divider" />
                    </li>
                    <li>
                      <a
                        href={ticketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dropdown-item"
                      >
                        <FaTicket className="me-2" />
                        {t("navbar.help")}
                      </a>
                    </li>
                  </>
                )}
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <button
                    className="dropdown-item d-flex align-items-center"
                    onClick={() => setShowLanguageModal(true)}
                  >
                    <span className="me-2">
                      {getLanguageFlag(i18n.language)}
                    </span>
                    <span>{getLanguageDisplayName(i18n.language)}</span>
                  </button>
                </li>
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <button
                    className="dropdown-item d-flex align-items-center"
                    onClick={handleLogout}
                  >
                    {renderLogoutIcon()}
                    <span className="text-danger">{t("navbar.logout")}</span>
                  </button>
                </li>
              </ul>
            </li>
            <li className="nav-item">
              <button
                key={themePreference}
                className="btn btn-link nav-link"
                onClick={toggleTheme}
                title={themeToggleLabel}
                aria-label={themeToggleLabel}
              >
                <ThemeIcon />
              </button>
            </li>
          </ul>
        ) : (
          <ul className="nav nav-pills ms-auto">
            <li className="nav-item">
              <Link to="/login" className="nav-link">
                {t("navbar.login")}
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/register" className="nav-link">
                {t("navbar.signup")}
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/about" className="nav-link">
                {t("navbar.about")}
              </Link>
            </li>
            <li className="nav-item">
              <a href="/docs" className="nav-link">
                {t("navbar.docs")}
              </a>
            </li>
            <li className="nav-item">
              <button
                className="btn btn-link nav-link"
                onClick={() => setShowLanguageModal(true)}
              >
                {getLanguageFlag(i18n.language)}
              </button>
            </li>
            <li className="nav-item">
              <button
                key={themePreference}
                className="btn btn-link nav-link"
                onClick={toggleTheme}
                title={themeToggleLabel}
                aria-label={themeToggleLabel}
              >
                <ThemeIcon />
              </button>
            </li>
          </ul>
        )}
      </div>

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <div className="modal show d-block modal-backdrop-custom" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="bi bi-globe me-2" />
                  {t("language.changeLanguage")}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowLanguageModal(false)}
                  aria-label="Close"
                />
              </div>
              <div className="modal-body">
                <div className="list-group">
                  {supportedLanguages.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                        i18n.language === lang ? "border-primary border-2" : ""
                      }`}
                      onClick={() => changeLanguage(lang)}
                    >
                      <span>
                        <span className="me-2 flag-icon-lg">
                          {getLanguageFlag(lang)}
                        </span>
                        {getLanguageDisplayName(lang)}
                      </span>
                      {i18n.language === lang && (
                        <i className="bi bi-check-circle text-success" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowLanguageModal(false)}
                >
                  {t("buttons.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Organization Switcher Modal */}
      <OrganizationSwitcher
        currentUser={currentUser}
        activeOrganization={activeOrganization}
        onOrganizationSwitch={onOrganizationSwitch}
        showModal={showOrgModal}
        setShowModal={setShowOrgModal}
        theme={theme}
      />
    </nav>
  );
};

Navbar.propTypes = {
  currentUser: PropTypes.shape({
    username: PropTypes.string,
    provider: PropTypes.string,
    accessToken: PropTypes.string,
    email: PropTypes.string,
    organization: PropTypes.string,
  }),
  gravatarUrl: PropTypes.string,
  showAdminBoard: PropTypes.bool,
  showOrgConsole: PropTypes.bool,
  theme: PropTypes.string.isRequired,
  themePreference: PropTypes.string.isRequired,
  toggleTheme: PropTypes.func.isRequired,
  logOut: PropTypes.func.isRequired,
  logOutLocal: PropTypes.func.isRequired,
  activeOrganization: PropTypes.string,
  onOrganizationSwitch: PropTypes.func,
};

export default Navbar;
