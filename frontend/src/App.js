import React, { useState, useEffect } from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import "@fortawesome/fontawesome-free/css/all.css";
import "@fortawesome/fontawesome-free/js/all.js";
import "./App.css";

import AuthService from "./services/auth.service";
import Login from "./components/login.component";
import Register from "./components/register.component";
import About from "./components/about.component";
import Profile from "./components/profile.component";
import Admin from "./components/admin.component";
import Moderator from "./components/moderator.component"; // Import the Moderator component
import Box from "./components/box.component";
import Organization from "./components/organization.component";
import Version from "./components/version.component";
import Provider from "./components/provider.component";

import EventBus from "./common/EventBus";

const App = () => {
  const [showAdminBoard, setShowAdminBoard] = useState(false);
  const [showModeratorBoard, setShowModeratorBoard] = useState(false);
  const [currentUser, setCurrentUser] = useState(undefined);
  const [userOrganization, setUserOrganization] = useState("");
  const [gravatarUrl, setGravatarUrl] = useState("");

  useEffect(() => {
    const user = AuthService.getCurrentUser();

    if (user) {
      setCurrentUser(user);
      setShowAdminBoard(user.roles.includes("ROLE_ADMIN"));
      setShowModeratorBoard(user.roles.includes("ROLE_MODERATOR"));
      setUserOrganization(user.organization);

      const emailHash = user.emailHash;
      AuthService.getGravatarProfile(emailHash).then((profile) => {
        if (profile && profile.avatar_url) {
          setGravatarUrl(profile.avatar_url);
        }
      });
    }

    EventBus.on("logout", () => {
      logOut();
    });

    return () => {
      EventBus.remove("logout");
    };
  }, []);

  const logOut = () => {
    AuthService.logout();
    setShowAdminBoard(false);
    setShowModeratorBoard(false);
    setCurrentUser(undefined);
    setUserOrganization("");
    setGravatarUrl("");
  };

  return (
    <div>
      <nav className="navbar navbar-expand navbar-dark bg-dark">
        <div className="container-fluid">
          <Link to={"/"} className="navbar-brand">
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
                  {gravatarUrl && (
                    <img
                      src={gravatarUrl}
                      alt="User Avatar"
                      className="rounded-circle"
                      width="30"
                      height="30"
                      style={{ marginRight: "10px" }}
                    />
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
                  <li>
                    <button onClick={logOut} className="dropdown-item">
                      Logout
                    </button>
                  </li>
                </ul>
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
            </ul>
          )}
        </div>
      </nav>

      <div className="container mt-3">
        <Routes>
          <Route path="/" element={<Organization showOnlyPublic={true} />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/moderator" element={<Moderator currentOrganization={userOrganization} />} />
          <Route path="/:organization" element={<Organization showOnlyPublic={false} />} />
          <Route path="/:organization/:name" element={<Box />} />
          <Route path="/:organization/:name/:version" element={<Version />} />
          <Route path="/:organization/:name/:version/:providerName" element={<Provider />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
};

export default App;