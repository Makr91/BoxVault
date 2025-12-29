import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FaMoon, FaSun } from "react-icons/fa6";
import BoxVaultLight from '../images/BoxVault.svg?react';
import BoxVaultDark from '../images/BoxVaultDark.svg?react';

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

  const handleLogout = () => {
    if (logoutEverywhere) {
      logOut();
    } else {
      logOutLocal();
    }
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
                      Moderator
                    </Link>
                  </li>
                )}
                <li>
                  <Link to="/profile" className="dropdown-item">
                    Profile
                  </Link>
                </li>
                <li>
                  <Link to="/about" className="dropdown-item">
                    About
                  </Link>
                </li>
                {showAdminBoard && (
                  <li>
                    <Link to="/admin" className="dropdown-item">
                      Admin
                    </Link>
                  </li>
                )}
                <li>
                  <hr className="dropdown-divider" />
                </li>
                <li className="px-3 py-2">
                  <div className="d-flex align-items-center gap-2">
                    <button
                      onClick={handleLogout}
                      className="btn btn-outline-danger btn-sm"
                    >
                      Logout
                    </button>
                    <div className="form-check mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="logoutEverywhere"
                        checked={logoutEverywhere}
                        onChange={(e) => setLogoutEverywhere(e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <label
                        className="form-check-label"
                        htmlFor="logoutEverywhere"
                      >
                        Everywhere
                      </label>
                    </div>
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
