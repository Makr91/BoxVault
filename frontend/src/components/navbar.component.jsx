import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  FaMoon,
  FaSun,
  FaTicket,
  FaUser,
  FaCircleInfo,
  FaGear,
  FaUserShield,
  FaIdBadge,
  FaHouseLock,
  FaBridgeLock,
} from "react-icons/fa6";
import { Link } from "react-router-dom";

import { getSupportedLanguages } from "../i18n";
import BoxVaultLight from "../images/BoxVault.svg?react";
import BoxVaultDark from "../images/BoxVaultDark.svg?react";
import FavoritesService from "../services/favorites.service";
import { log } from "../utils/Logger";

const Navbar = ({
  currentUser,
  userOrganization,
  gravatarUrl,
  showAdminBoard,
  showModeratorBoard,
  theme,
  toggleTheme,
  logOut,
  logOutLocal,
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

  // Get language display name
  const getLanguageDisplayName = (languageCode) => {
    const languageNames = {
      en: "English",
      es: "Español",
    };
    return languageNames[languageCode] || languageCode.toUpperCase();
  };

  // Get flag icon for language
  const getLanguageFlag = (languageCode) => {
    const flagKey = `language.flagIcon.${languageCode}`;
    return t(flagKey, { ns: "common", defaultValue: "🌐" });
  };

  // Get supported languages from i18n
  const supportedLanguages = getSupportedLanguages();

  const handleLogout = () => {
    if (logoutEverywhere) {
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

  useEffect(() => {
    let mounted = true;

    const loadTrustedIssuers = async () => {
      try {
        const response = await fetch(
          `${window.location.origin}/api/auth/oidc/issuers`
        );
        if (response.ok && mounted) {
          const data = await response.json();
          setTrustedIssuers(data.issuers || []);
          log.auth.debug("Trusted issuers loaded", {
            count: data.issuers?.length,
          });
        }
      } catch (error) {
        log.auth.error("Failed to load trusted issuers", {
          error: error.message,
        });
        setTrustedIssuers([]);
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

        // CRITICAL: Validate against backend-provided whitelist (CodeQL requirement)
        const isTrusted = trustedIssuers.some(
          (trustedIssuer) => trustedIssuer.issuer === issuer
        );
        if (!isTrusted) {
          log.auth.warn("Issuer not in trusted whitelist", { issuer });
          return "";
        }

        // Validate issuer URL for security
        if (!issuer || !issuer.startsWith("https://")) {
          return "";
        }

        try {
          const url = new URL(issuer);
          // Additional security checks
          if (url.protocol === "https:" && url.hostname) {
            return issuer;
          }
        } catch {
          log.auth.warn("Invalid issuer URL format", { issuer });
        }
      } catch (error) {
        log.auth.debug("Could not extract issuer from id_token", {
          error: error.message,
        });
      }
      return "";
    },
    [trustedIssuers]
  );

  useEffect(() => {
    let mounted = true;

    const loadConfigs = async () => {
      try {
        const ticketResponse = await fetch(
          `${window.location.origin}/api/config/ticket`
        );
        if (ticketResponse.ok) {
          const data = await ticketResponse.json();
          if (mounted && data?.ticket_system) {
            setTicketConfig(data.ticket_system);
          }
        }

        if (
          currentUser?.provider?.startsWith("oidc-") &&
          currentUser?.accessToken
        ) {
          const issuerUrl = extractAuthServerUrl(currentUser.accessToken);
          if (issuerUrl && mounted) {
            setAuthServerUrl(issuerUrl);
          }
        }
      } catch (error) {
        log.api.error("Error loading configs", { error: error.message });
      }
    };

    loadConfigs();

    return () => {
      mounted = false;
    };
  }, [currentUser, extractAuthServerUrl]);

  const buildTicketUrl = () => {
    if (!ticketConfig || !ticketConfig.enabled?.value) {
      return null;
    }
    if (!userClaims) {
      return null;
    }

    const baseUrl = ticketConfig.base_url?.value || "";
    const req = ticketConfig.req_type?.value || "sso";
    const context = ticketConfig.context?.value || "";
    const customerId = userClaims.customer_id || "BOXVAULT";
    const userName = userClaims.name || userClaims.email || "User";
    const email = userClaims.email || "";

    const params = new URLSearchParams({
      req,
      customerId,
      user: userName,
      email,
      context,
    });

    return `${baseUrl}&${params.toString()}`;
  };

  const ticketUrl = buildTicketUrl();

  const handleFavoriteClick = (app, event) => {
    event.preventDefault();
    if (app.homeUrl && app.homeUrl !== "") {
      window.open(app.homeUrl, "_blank", "noopener,noreferrer");
    }
  };

  const renderAppIcon = (app) => {
    const iconStyle = { width: "20px", height: "20px", marginRight: "8px" };

    if (app.iconUrl && app.iconUrl !== "") {
      return (
        <img
          src={app.iconUrl}
          style={iconStyle}
          alt=""
          onError={(e) => {
            e.target.style.display = "none";
          }}
        />
      );
    }

    if (app.homeUrl && app.homeUrl !== "") {
      try {
        const faviconUrl = `${new URL(app.homeUrl).origin}/favicon.ico`;
        return (
          <img
            src={faviconUrl}
            style={iconStyle}
            alt=""
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        );
      } catch (e) {
        log.component.debug("Invalid URL for favicon", {
          url: app.homeUrl,
          error: e.message,
        });
        return null;
      }
    }

    return null;
  };

  const renderUserAvatar = () => {
    if (gravatarUrl) {
      return (
        <img
          src={gravatarUrl}
          alt="User Avatar"
          className="rounded-circle"
          width="30"
          height="30"
          style={{ marginRight: "10px", verticalAlign: "middle" }}
        />
      );
    }

    const LogoComponent = theme === "light" ? BoxVaultLight : BoxVaultDark;
    return (
      <LogoComponent
        style={{
          width: "30px",
          height: "30px",
          marginRight: "10px",
        }}
      />
    );
  };

  const renderProfileMenuItem = () => {
    const isOidcUser = currentUser?.provider?.startsWith("oidc-");
    // Validate auth server URL is a safe HTTPS URL
    const isValidAuthServerUrl =
      authServerUrl && authServerUrl.startsWith("https://");

    if (!isOidcUser || !isValidAuthServerUrl) {
      return (
        <>
          <FaUser className="me-2" />
          <Link to="/profile" className="text-decoration-none text-reset">
            Profile
          </Link>
        </>
      );
    }

    return (
      <>
        {profileIsLocal ? (
          <FaUser
            className="me-2"
            onClick={handleProfileToggle}
            onKeyPress={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleProfileToggle(e);
              }
            }}
            role="button"
            tabIndex={0}
            title="Switch to auth server profile"
            style={{ cursor: "pointer" }}
          />
        ) : (
          <FaIdBadge
            className="me-2"
            onClick={handleProfileToggle}
            onKeyPress={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleProfileToggle(e);
              }
            }}
            role="button"
            tabIndex={0}
            title="Switch to local profile"
            style={{ cursor: "pointer" }}
          />
        )}
        {profileIsLocal ? (
          <Link to="/profile" className="text-decoration-none text-reset">
            Profile
          </Link>
        ) : (
          <a
            href={`${authServerUrl}/user/profile`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-decoration-none text-reset"
          >
            Profile
          </a>
        )}
      </>
    );
  };

  return (
    <nav className="navbar navbar-expand-lg">
      <div className="container-fluid">
        <Link to="/" className="navbar-brand">
          {theme === "light" ? (
            <BoxVaultLight
              style={{ width: "30px", height: "30px", marginRight: "10px" }}
            />
          ) : (
            <BoxVaultDark
              style={{ width: "30px", height: "30px", marginRight: "10px" }}
            />
          )}
          BoxVault
        </Link>
        <ul className="nav nav-pills me-auto">
          {currentUser && userOrganization && (
            <li className="nav-item">
              <Link to={`/${userOrganization}`} className="nav-link">
                {userOrganization}
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
                {showModeratorBoard && (
                  <li>
                    <Link to="/moderator" className="dropdown-item">
                      <FaUserShield className="me-2" />
                      Moderator
                    </Link>
                  </li>
                )}
                <li>
                  <div className="dropdown-item d-flex align-items-center">
                    {renderProfileMenuItem()}
                  </div>
                </li>
                <li>
                  <Link to="/about" className="dropdown-item">
                    <FaCircleInfo className="me-2" />
                    About
                  </Link>
                </li>
                {favoriteApps && favoriteApps.length > 0 && (
                  <>
                    <li>
                      <hr className="dropdown-divider" />
                    </li>
                    <li className="dropdown-header">Favorite Applications</li>
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
                            {renderAppIcon(app)}
                            {app.customLabel || app.clientName || app.clientId}
                          </a>
                        </li>
                      ))}
                  </>
                )}
                {showAdminBoard && (
                  <>
                    <li>
                      <hr className="dropdown-divider" />
                    </li>
                    <li>
                      <Link to="/admin" className="dropdown-item">
                        <FaGear className="me-2" />
                        Admin
                      </Link>
                    </li>
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
                        Open Ticket
                      </a>
                    </li>
                  </>
                )}
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <button
                    className="dropdown-item"
                    onClick={() => setShowLanguageModal(true)}
                  >
                    <span className="me-2" style={{ fontSize: "1.2em" }}>
                      {getLanguageFlag(i18n.language)}
                    </span>
                    {getLanguageDisplayName(i18n.language)}
                  </button>
                </li>
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li>
                  <div className="dropdown-item d-flex align-items-center">
                    {logoutEverywhere ? (
                      <FaBridgeLock
                        className="me-2 text-danger"
                        onClick={handleLogoutToggle}
                        onKeyPress={handleLogoutToggleKeyPress}
                        role="button"
                        tabIndex={0}
                        title="Click to logout locally only"
                        style={{ cursor: "pointer" }}
                      />
                    ) : (
                      <FaHouseLock
                        className="me-2 text-danger"
                        onClick={handleLogoutToggle}
                        onKeyPress={handleLogoutToggleKeyPress}
                        role="button"
                        tabIndex={0}
                        title="Click to logout everywhere"
                        style={{ cursor: "pointer" }}
                      />
                    )}
                    <span
                      onClick={handleLogout}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleLogout();
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className="text-danger"
                      style={{ cursor: "pointer" }}
                    >
                      Logout
                    </span>
                  </div>
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
                Login
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/register" className="nav-link">
                Sign Up
              </Link>
            </li>
            <li className="nav-item">
              <Link to="/about" className="nav-link">
                About
              </Link>
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
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
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
                        i18n.language === lang ? "active" : ""
                      }`}
                      onClick={() => changeLanguage(lang)}
                    >
                      <span>
                        <span className="me-2" style={{ fontSize: "1.2em" }}>
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
    </nav>
  );
};

Navbar.propTypes = {
  currentUser: PropTypes.shape({
    username: PropTypes.string,
    provider: PropTypes.string,
    accessToken: PropTypes.string,
  }),
  userOrganization: PropTypes.string,
  gravatarUrl: PropTypes.string,
  showAdminBoard: PropTypes.bool,
  showModeratorBoard: PropTypes.bool,
  theme: PropTypes.string.isRequired,
  toggleTheme: PropTypes.func.isRequired,
  logOut: PropTypes.func.isRequired,
  logOutLocal: PropTypes.func.isRequired,
};

export default Navbar;
