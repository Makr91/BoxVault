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
  FaSliders,
  FaHouseLock,
  FaBridgeLock,
  FaBook,
  FaBuilding,
  FaChevronRight,
  FaRightToBracket,
  FaStar,
  FaCircleHalfStroke,
} from "react-icons/fa6";
import { Link } from "react-router-dom";

import { getSupportedLanguages } from "../i18n";
import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import FavoritesService from "../services/favorites.service";
import UserService from "../services/user.service";
import { fetchTrustedIssuers, resolveIssuer } from "../utils/authServer";
import { userDisplayName, userSecondaryLine } from "../utils/displayName";
import { log } from "../utils/Logger";

import NotificationsItem from "./NotificationsItem.component";
import OrganizationSwitcher from "./OrganizationSwitcher.component";

const THEME_ICONS = { auto: FaCircleHalfStroke, light: FaSun, dark: FaMoon };

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
    return "🌐";
  }

  return "🌐";
};

const hasNotificationsScope = (claims) =>
  []
    .concat(claims?.scope || [])
    .join(" ")
    .split(/\s+/)
    .includes("notifications");

const isOidcSession = (user) => !!user?.provider?.startsWith("oidc-");

const resolveFaviconUrl = (homeUrl) => {
  if (!homeUrl) {
    return "";
  }
  try {
    return `${new URL(homeUrl).origin}/favicon.ico`;
  } catch (error) {
    log.component.debug("Invalid URL for favicon", {
      url: homeUrl,
      error: error.message,
    });
    return "";
  }
};

const AppIcon = ({ app }) => {
  const [failed, setFailed] = useState(false);
  const iconUrl = app.iconUrl || resolveFaviconUrl(app.homeUrl);

  if (!iconUrl || failed) {
    return <FaStar className="text-warning logo-md icon-with-margin" />;
  }

  return (
    <img
      src={iconUrl}
      className="logo-md icon-with-margin"
      alt=""
      onError={() => setFailed(true)}
    />
  );
};

AppIcon.propTypes = {
  app: PropTypes.shape({
    iconUrl: PropTypes.string,
    homeUrl: PropTypes.string,
  }).isRequired,
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

const UserAvatar = ({ gravatarUrl, theme, size }) => {
  if (gravatarUrl) {
    return (
      <img
        src={gravatarUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-circle flex-shrink-0"
      />
    );
  }
  return <BrandLogo theme={theme} className="logo-xl flex-shrink-0" />;
};

UserAvatar.propTypes = {
  gravatarUrl: PropTypes.string,
  theme: PropTypes.string.isRequired,
  size: PropTypes.number.isRequired,
};

const IdentityCard = ({ displayName, email, gravatarUrl, theme, idpUrl }) => {
  const body = (
    <>
      <UserAvatar gravatarUrl={gravatarUrl} theme={theme} size={36} />
      <span className="flex-grow-1 min-width-0">
        <span className="d-block fw-semibold text-truncate">{displayName}</span>
        {email && (
          <small className="d-block text-body-secondary text-truncate">
            {email}
          </small>
        )}
      </span>
      <FaChevronRight className="text-body-secondary flex-shrink-0" />
    </>
  );
  const className = "dropdown-item user-card d-flex align-items-center gap-3";

  if (idpUrl) {
    return (
      <a
        href={`${idpUrl}/user/profile`}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {body}
      </a>
    );
  }
  return (
    <Link to="/profile" className={className}>
      {body}
    </Link>
  );
};

IdentityCard.propTypes = {
  displayName: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  gravatarUrl: PropTypes.string,
  theme: PropTypes.string.isRequired,
  idpUrl: PropTypes.string.isRequired,
};

const LogoutRow = ({ oidc, onLogout }) => {
  const { t } = useTranslation();
  const [everywhere, setEverywhere] = useState(true);
  const ScopeIcon = everywhere ? FaBridgeLock : FaHouseLock;

  const toggleScope = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setEverywhere((current) => !current);
  };

  const toggleScopeKey = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      toggleScope(event);
    }
  };

  return (
    <button
      className="dropdown-item d-flex align-items-center text-danger"
      onClick={() => onLogout(oidc && everywhere)}
    >
      {oidc ? (
        <span
          role="button"
          tabIndex={0}
          className="d-inline-flex me-2 logout-scope"
          onClick={toggleScope}
          onKeyDown={toggleScopeKey}
          title={
            everywhere
              ? t("navbar.logoutEverywhereTitle")
              : t("navbar.logoutLocalTitle")
          }
        >
          <ScopeIcon />
        </span>
      ) : (
        <FaHouseLock className="me-2" />
      )}
      <span>{t("navbar.logout")}</span>
    </button>
  );
};

LogoutRow.propTypes = {
  oidc: PropTypes.bool.isRequired,
  onLogout: PropTypes.func.isRequired,
};

const FavoriteRows = ({ apps }) => {
  const { t } = useTranslation();
  if (!apps || apps.length === 0) {
    return null;
  }
  const sorted = [...apps].sort((a, b) => (a.order || 0) - (b.order || 0));
  return (
    <>
      <li>
        <hr className="dropdown-divider" />
      </li>
      <li className="dropdown-header py-0">{t("navbar.favorites")}</li>
      {sorted.map((app) => (
        <li key={app.clientId}>
          <a
            href={app.homeUrl || "#"}
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
  );
};

FavoriteRows.propTypes = {
  apps: PropTypes.arrayOf(
    PropTypes.shape({
      clientId: PropTypes.string.isRequired,
      clientName: PropTypes.string,
      customLabel: PropTypes.string,
      iconUrl: PropTypes.string,
      homeUrl: PropTypes.string,
      order: PropTypes.number,
    })
  ),
};

const LanguageModal = ({ show, current, languages, onPick, onClose }) => {
  const { t } = useTranslation();
  if (!show) {
    return null;
  }
  return (
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
              onClick={onClose}
              aria-label="Close"
            />
          </div>
          <div className="modal-body">
            <div className="list-group">
              {languages.map((lang) => (
                <button
                  key={lang}
                  type="button"
                  className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                    current === lang ? "border-primary border-2" : ""
                  }`}
                  onClick={() => onPick(lang)}
                >
                  <span>
                    <span className="me-2 flag-icon-lg">
                      {getLanguageFlag(lang)}
                    </span>
                    {getLanguageDisplayName(lang)}
                  </span>
                  {current === lang && (
                    <i className="bi bi-check-circle text-success" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

LanguageModal.propTypes = {
  show: PropTypes.bool.isRequired,
  current: PropTypes.string.isRequired,
  languages: PropTypes.arrayOf(PropTypes.string).isRequired,
  onPick: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

const resolveMemberships = (user) =>
  Array.isArray(user?.organizations) ? user.organizations : [];

const resolveDisplayName = (userClaims, user) =>
  userClaims?.name || userDisplayName(user);

const knobValue = (config, key) => config?.[key]?.value || "";

const firstValue = (...values) => values.find((value) => !!value) || "";

const buildTicketUrl = ({ ticketConfig, activeOrgCode, userClaims, user }) => {
  if (!knobValue(ticketConfig, "enabled")) {
    return null;
  }

  const claims = userClaims || {};
  const params = new URLSearchParams({
    req: firstValue(knobValue(ticketConfig, "req_type"), "sso"),
    customerId: firstValue(
      activeOrgCode,
      claims.customer_id,
      knobValue(ticketConfig, "fallback_customer_id")
    ),
    user: firstValue(claims.name, userDisplayName(user)),
    email: firstValue(claims.email, user?.email),
    context: knobValue(ticketConfig, "context"),
  });

  return `${knobValue(ticketConfig, "base_url")}&${params.toString()}`;
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
  const ThemeIcon = THEME_ICONS[themePreference] || FaCircleHalfStroke;
  const themeToggleLabel = t(`theme.${themePreference}`);
  const languageLabel = `${t("language.changeLanguage")}: ${getLanguageDisplayName(i18n.language)}`;
  const [favoriteApps, setFavoriteApps] = useState([]);
  const [userClaims, setUserClaims] = useState(null);
  const [ticketConfig, setTicketConfig] = useState(null);
  const [authServerUrl, setAuthServerUrl] = useState("");
  const [trustedIssuers, setTrustedIssuers] = useState([]);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [activeOrgGravatar, setActiveOrgGravatar] = useState(null);
  const [activeOrgCode, setActiveOrgCode] = useState(null);

  const oidc = isOidcSession(currentUser);
  const memberships = resolveMemberships(currentUser);
  const supportedLanguages = getSupportedLanguages();

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

    await i18n.changeLanguage(lng);
    setShowLanguageModal(false);
  };

  const handleLogout = (everywhere) => {
    if (everywhere) {
      logOut();
    } else {
      logOutLocal();
    }
  };

  useEffect(() => {
    let mounted = true;

    const loadTrustedIssuers = async () => {
      try {
        const issuers = await fetchTrustedIssuers();
        if (mounted) {
          setTrustedIssuers(issuers);
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

    const loadUserData = async () => {
      if (!isOidcSession(currentUser)) {
        setFavoriteApps([]);
        setUserClaims(null);
        return;
      }
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
    };

    loadUserData();

    return () => {
      mounted = false;
    };
  }, [currentUser]);

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
        isOidcSession(currentUser) &&
        currentUser?.accessToken
      ) {
        const issuerUrl = resolveIssuer(
          currentUser.accessToken,
          trustedIssuers
        );
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
    trustedIssuers,
    activeOrganization,
    fetchTicketConfig,
    fetchOrgGravatar,
  ]);

  const ticketUrl = buildTicketUrl({
    ticketConfig,
    activeOrgCode,
    userClaims,
    user: currentUser,
  });

  const displayName = resolveDisplayName(userClaims, currentUser);
  const email = userSecondaryLine({ ...currentUser, name: displayName });

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
    return <BrandLogo theme={theme} className="logo-sm me-2" />;
  };

  const renderAppSection = () => (
    <>
      <li>
        <hr className="dropdown-divider" />
      </li>
      <li className="dropdown-header py-0">{t("navbar.boxvault")}</li>
      {showAdminBoard && (
        <li>
          <Link to="/admin" className="dropdown-item">
            <FaGear className="me-2" />
            {t("navbar.admin")}
          </Link>
        </li>
      )}
      {showOrgConsole && (
        <li>
          <Link to="/org-console" className="dropdown-item">
            <FaBuilding className="me-2" />
            {t("navbar.orgConsole")}
          </Link>
        </li>
      )}
      <li>
        <Link to="/profile" className="dropdown-item">
          <FaUser className="me-2" />
          {t("navbar.profile")}
        </Link>
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
    </>
  );

  const renderUserMenu = () => (
    <li className="nav-item dropdown user-menu">
      <button
        className="nav-link dropdown-toggle d-flex align-items-center gap-2"
        id="navbarDropdown"
        data-bs-toggle="dropdown"
        aria-expanded="false"
        aria-label={t("navbar.accountMenu")}
      >
        <span className="fw-semibold">{displayName}</span>
        <UserAvatar gravatarUrl={gravatarUrl} theme={theme} size={30} />
      </button>
      <ul
        className="dropdown-menu dropdown-menu-end"
        aria-labelledby="navbarDropdown"
      >
        <li>
          <IdentityCard
            displayName={displayName}
            email={email}
            gravatarUrl={gravatarUrl}
            theme={theme}
            idpUrl={oidc ? authServerUrl : ""}
          />
        </li>
        {memberships.length >= 2 && activeOrganization && (
          <li>
            <button
              type="button"
              className="dropdown-item d-flex align-items-center"
              onClick={() => setShowOrgModal(true)}
            >
              {renderOrgIcon()}
              <span className="text-truncate">{activeOrganization}</span>
            </button>
          </li>
        )}
        {oidc && authServerUrl && (
          <li>
            <a
              href={`${authServerUrl}/user/profile#preferences`}
              target="_blank"
              rel="noopener noreferrer"
              className="dropdown-item"
            >
              <FaSliders className="me-2" />
              {t("navbar.preferences")}
            </a>
          </li>
        )}
        <FavoriteRows apps={favoriteApps} />
        {renderAppSection()}
        {(hasNotificationsScope(userClaims) || ticketUrl) && (
          <li>
            <hr className="dropdown-divider" />
          </li>
        )}
        {hasNotificationsScope(userClaims) && (
          <NotificationsItem authServerUrl={authServerUrl} />
        )}
        {ticketUrl && (
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
        )}
        <li>
          <hr className="dropdown-divider" />
        </li>
        <li>
          <LogoutRow oidc={oidc} onLogout={handleLogout} />
        </li>
      </ul>
    </li>
  );

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
          {!currentUser && (
            <>
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
            </>
          )}
        </ul>

        <ul className="nav nav-pills ms-auto align-items-center">
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
          <li className="nav-item">
            <button
              className="btn btn-link nav-link"
              onClick={() => setShowLanguageModal(true)}
              title={languageLabel}
              aria-label={languageLabel}
            >
              {getLanguageFlag(i18n.language)}
            </button>
          </li>
          {currentUser ? (
            renderUserMenu()
          ) : (
            <li className="nav-item">
              <Link
                to="/login"
                className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
              >
                <FaRightToBracket />
                {t("navbar.signIn")}
              </Link>
            </li>
          )}
        </ul>
      </div>

      <LanguageModal
        show={showLanguageModal}
        current={i18n.language}
        languages={supportedLanguages}
        onPick={changeLanguage}
        onClose={() => setShowLanguageModal(false)}
      />

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
    name: PropTypes.string,
    provider: PropTypes.string,
    accessToken: PropTypes.string,
    email: PropTypes.string,
    organization: PropTypes.string,
    organizations: PropTypes.arrayOf(PropTypes.object),
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
