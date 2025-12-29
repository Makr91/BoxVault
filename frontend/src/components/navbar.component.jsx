import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FaMoon, FaSun, FaGlobe, FaHouse, FaTicket, FaUser, FaCircleInfo, FaGear, FaUserShield, FaIdBadge } from "react-icons/fa6";
import BoxVaultLight from '../images/BoxVault.svg?react';
import BoxVaultDark from '../images/BoxVaultDark.svg?react';
import FavoritesService from '../services/favorites.service';
import ConfigService from '../services/config.service';

const Navbar = ({
  currentUser,
  userOrganization,
  gravatarUrl,
  showAdminBoard,
  showModeratorBoard,
  theme,
  toggleTheme,
  logOut,
  logOutLocal
}) => {
  const [logoutEverywhere, setLogoutEverywhere] = useState(true);
  const [profileIsLocal, setProfileIsLocal] = useState(true);
  const [favoriteApps, setFavoriteApps] = useState([]);
  const [userClaims, setUserClaims] = useState(null);
  const [ticketConfig, setTicketConfig] = useState(null);
  const [authServerUrl, setAuthServerUrl] = useState('');

  const handleLogout = () => {
    if (logoutEverywhere) {
      logOut();
    } else {
      logOutLocal();
    }
  };

  // Load favorites and user claims when authenticated with OIDC
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const loadUserData = async () => {
      if (currentUser?.provider?.startsWith('oidc-')) {
        try {
          const response = await FavoritesService.getUserInfoClaims();
          if (mounted) {
            setUserClaims(response.data);
            setFavoriteApps(response.data?.favorite_apps || []);
          }
        } catch (error) {
          if (!error.name?.includes('Cancel') && !error.message?.includes('aborted')) {
            console.error('Error loading user claims:', error);
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

  // Load ticket config and extract auth server URL from id_token
  useEffect(() => {
    let mounted = true;
    
    const loadConfigs = async () => {
      try {
        // Load ticket config
        const ticketResponse = await fetch(`${window.location.origin}/api/config/ticket`);
        if (ticketResponse.ok) {
          const data = await ticketResponse.json();
          if (mounted && data?.ticket_system) {
            setTicketConfig(data.ticket_system);
          }
        }

        // Get auth server URL from id_token for OIDC users
        if (currentUser?.provider?.startsWith('oidc-') && currentUser?.accessToken) {
          try {
            const jwtPayload = JSON.parse(atob(currentUser.accessToken.split('.')[1]));
            if (jwtPayload.id_token) {
              const idTokenPayload = JSON.parse(atob(jwtPayload.id_token.split('.')[1]));
              if (idTokenPayload.iss && mounted) {
                setAuthServerUrl(idTokenPayload.iss);
              }
            }
          } catch (error) {
            console.debug('Could not extract issuer from id_token:', error);
          }
        }
      } catch (error) {
        console.error('Error loading configs:', error);
      }
    };

    loadConfigs();

    return () => {
      mounted = false;
    };
  }, [currentUser]);

  const buildTicketUrl = () => {
    if (!ticketConfig || !ticketConfig.enabled?.value) return null;
    if (!userClaims) return null;

    const baseUrl = ticketConfig.base_url?.value || '';
    const req = ticketConfig.req_type?.value || 'sso';
    const context = ticketConfig.context?.value || '';
    const customerId = userClaims.customer_id || 'BOXVAULT';
    const userName = userClaims.name || userClaims.email || 'User';
    const email = userClaims.email || '';

    const params = new URLSearchParams({
      req: req,
      customerId: customerId,
      user: userName,
      email: email,
      context: context
    });

    return `${baseUrl}&${params.toString()}`;
  };

  const ticketUrl = buildTicketUrl();

  const handleFavoriteClick = (app, event) => {
    event.preventDefault();
    if (app.homeUrl && app.homeUrl !== '') {
      window.open(app.homeUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const renderAppIcon = (app) => {
    const iconStyle = { width: '20px', height: '20px', marginRight: '8px' };
    
    if (app.iconUrl && app.iconUrl !== '') {
      return (
        <img 
          src={app.iconUrl} 
          style={iconStyle}
          alt=""
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      );
    }
    
    if (app.homeUrl && app.homeUrl !== '') {
      try {
        const faviconUrl = new URL(app.homeUrl).origin + '/favicon.ico';
        return (
          <img 
            src={faviconUrl} 
            style={iconStyle}
            alt=""
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        );
      } catch (error) {
        // Invalid URL, skip icon
        return null;
      }
    }
    
    return null;
  };
  return (
    <nav className={`navbar navbar-expand-lg`}>
      <div className="container-fluid">
        <Link to={"/"} className="navbar-brand">
          {theme === "light" ? <BoxVaultLight style={{ width: "30px", height: "30px", marginRight: "10px" }}  /> : <BoxVaultDark style={{ width: "30px", height: "30px", marginRight: "10px" }}  />}
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
                {gravatarUrl ? (
                  <img
                    src={gravatarUrl}
                    alt="User Avatar"
                    className="rounded-circle"
                    width="30"
                    height="30"
                    style={{ marginRight: '10px', verticalAlign: 'middle' }}
                  />
                ) : (
                  theme === "light" ? <BoxVaultLight style={{ width: "30px", height: "30px", marginRight: "10px" }}  /> : <BoxVaultDark style={{ width: "30px", height: "30px", marginRight: "10px" }}  />
                )}
                {currentUser.username}
              </button>
              <ul className="dropdown-menu" aria-labelledby="navbarDropdown">
                {showModeratorBoard && (
                  <li>
                    <Link to="/moderator" className="dropdown-item">
                      <FaUserShield className="me-2" />
                      Moderator
                    </Link>
                  </li>
                )}
                <li className="px-3 py-2">
                  <div className="d-flex align-items-center gap-2">
                    {currentUser?.provider?.startsWith('oidc-') && authServerUrl ? (
                      <>
                        <button
                          className="btn btn-link p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProfileIsLocal(!profileIsLocal);
                          }}
                          title={profileIsLocal ? "Local profile" : "Auth server profile"}
                          style={{ fontSize: '1.2rem' }}
                        >
                          {profileIsLocal ? <FaUser /> : <FaIdBadge />}
                        </button>
                        {profileIsLocal ? (
                          <Link to="/profile" className="btn btn-link p-0">
                            Profile
                          </Link>
                        ) : (
                          <a
                            href={`${authServerUrl}/user/profile`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-link p-0"
                          >
                            Profile
                          </a>
                        )}
                      </>
                    ) : (
                      <>
                        <FaUser style={{ fontSize: '1.2rem' }} />
                        <Link to="/profile" className="btn btn-link p-0">
                          Profile
                        </Link>
                      </>
                    )}
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
                      .map(app => (
                        <li key={app.clientId}>
                          <a
                            href={app.homeUrl || '#'}
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
                <li className="px-3 py-2">
                  <div className="d-flex align-items-center gap-2">
                    <button
                      className="btn btn-link p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLogoutEverywhere(!logoutEverywhere);
                      }}
                      title={logoutEverywhere ? "Logout everywhere" : "Logout locally only"}
                      style={{ fontSize: '1.2rem' }}
                    >
                      {logoutEverywhere ? <FaGlobe /> : <FaHouse />}
                    </button>
                    <button
                      onClick={handleLogout}
                      className="btn btn-link text-danger p-0"
                    >
                      Logout
                    </button>
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
              <Link to={"/login"} className="nav-link">
                Login
              </Link>
            </li>
            <li className="nav-item">
              <Link to={"/register"} className="nav-link">
                Sign Up
              </Link>
            </li>
            <li className="nav-item">
              <Link to={"/about"} className="nav-link">
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
    </nav>
  );
};

export default Navbar;
