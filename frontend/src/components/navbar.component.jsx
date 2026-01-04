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
} from "react-icons/fa6";
import { Link } from "react-router-dom";

import { getSupportedLanguages } from "../i18n";
import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import AuthService from "../services/auth.service";
import FavoritesService from "../services/favorites.service";
import { log } from "../utils/Logger";

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

// Helper to normalize URLs
const normalizeUrl = (url) => url.replace(/\/+$/, "");

// Helper to validate issuer URL format
const validateIssuerFormat = (issuer) => {
  if (!issuer || !issuer.startsWith("https://")) {
    return false;
  }

  try {
    const url = new URL(issuer);
    return url.protocol === "https:" && url.hostname;
  } catch {
    log.auth.warn("Invalid issuer URL format", { issuer });
    return false;
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

const Navbar = ({
  currentUser,
  gravatarUrl,
  showAdminBoard,
  showModeratorBoard,
  theme,
  toggleTheme,
  logOut,
  logOutLocal,
  activeOrganization,
  onOrganizationSwitch,
}) => {
  const { t, i18n } = useTranslation();
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
        const response = await fetch(
          `${window.location.origin}/api/auth/oidc/issuers`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Check if response is JSON
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          log.auth.warn("Trusted issuers endpoint returned non-JSON response", {
            contentType,
            status: response.status,
          });
          if (mounted) {
            setTrustedIssuers([]);
          }
          return;
        }

        const data = await response.json();
        if (mounted) {
          setTrustedIssuers(data.issuers || []);
          log.auth.debug("Trusted issuers loaded", {
            count: data.issuers?.length,
          });
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

  // Helper to validate issuer is trusted
  const validateIssuerTrusted = useCallback(
    (issuer) => {
      const normalizedIssuer = normalizeUrl(issuer);
      const isTrusted = trustedIssuers.some(
        (trustedIssuer) =>
          normalizeUrl(trustedIssuer.issuer) === normalizedIssuer
      );

      if (!isTrusted) {
        log.auth.warn("Issuer not in trusted whitelist", {
          issuer,
          normalizedIssuer,
          trustedIssuers: trustedIssuers.map((trustedIssuer) =>
            normalizeUrl(trustedIssuer.issuer)
          ),
        });
      }
      return isTrusted;
    },
    [trustedIssuers]
  );

  const extractAuthServerUrl = useCallback(
    (accessToken) => {
      try {
        const jwtPayload = JSON.parse(atob(accessToken.split(".")[1]));
        if (!jwtPayload.id_token) {
          return "";
        }

        const idTokenPayload = JSON.parse(
          atob(jwtPayload.id_token.split(".")[1])
        );
        const issuer = idTokenPayload.iss || "";

        // Validate against whitelist and format
        if (!validateIssuerTrusted(issuer)) {
          return "";
        }

        if (!validateIssuerFormat(issuer)) {
          return "";
        }

        return issuer;
      } catch (error) {
        log.auth.debug("Could not extract issuer from id_token", {
          error: error.message,
        });
        return "";
      }
    },
    [validateIssuerTrusted]
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

      // Store org_code for ticket URL
      if (orgData.org_code && mounted) {
        setActiveOrgCode(orgData.org_code);
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
    activeOrganization,
    fetchTicketConfig,
    fetchOrgGravatar,
  ]);

  // Helper to get customer ID with priority logic
  const getCustomerId = useCallback(
    () => userClaims?.customer_id || activeOrgCode || "A55DF1",
    [userClaims, activeOrgCode]
  );

  // Helper to get user name from claims or current user
  const getUserName = useCallback(
    () =>
      userClaims?.name || userClaims?.email || currentUser?.username || "User",
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
          {theme === "light" ? (
            <BoxVaultLight className="logo-xl icon-with-margin-sm" />
          ) : (
            <BoxVaultDark className="logo-xl icon-with-margin-sm" />
          )}
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
            <li className="nav-item dropdown">
              <button
                className="nav-link dropdown-toggle"
                id="navbarDropdown"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                {renderUserAvatar()}
                {currentUser.username}
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
                {showModeratorBoard && (
                  <li>
                    <Link
                      to="/moderator"
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
                  {profileIsLocal || !authServerUrl ? (
                    <Link
                      to="/profile"
                      className="dropdown-item d-flex align-items-center"
                    >
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleProfileToggle(e);
                        }}
                        onKeyPress={handleProfileToggleKeyPress}
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
                      {t("navbar.profile")}
                    </Link>
                  ) : (
                    <a
                      href={`${authServerUrl}/user/profile`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dropdown-item d-flex align-items-center"
                    >
                      <span
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleProfileToggle(e);
                        }}
                        onKeyPress={handleProfileToggleKeyPress}
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
                      {t("navbar.profile")}
                    </a>
                  )}
                </li>
                <li>
                  <Link to="/about" className="dropdown-item">
                    <FaCircleInfo className="me-2" />
                    {t("navbar.about")}
                  </Link>
                </li>
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
                key={theme}
                className="btn btn-link nav-link"
                onClick={toggleTheme}
              >
                {theme === "light" ? <FaSun /> : <FaMoon />}
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
              <button
                className="btn btn-link nav-link"
                onClick={() => setShowLanguageModal(true)}
              >
                {getLanguageFlag(i18n.language)}
              </button>
            </li>
            <li className="nav-item">
              <button
                key={theme}
                className="btn btn-link nav-link"
                onClick={toggleTheme}
              >
                {theme === "light" ? <FaSun /> : <FaMoon />}
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
  showModeratorBoard: PropTypes.bool,
  theme: PropTypes.string.isRequired,
  toggleTheme: PropTypes.func.isRequired,
  logOut: PropTypes.func.isRequired,
  logOutLocal: PropTypes.func.isRequired,
  activeOrganization: PropTypes.string,
  onOrganizationSwitch: PropTypes.func,
};

export default Navbar;
