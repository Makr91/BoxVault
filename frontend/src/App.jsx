// React and routing
import React, { useState, useEffect, useCallback } from "react";

// Styles and Bootstrap
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './scss/styles.scss';
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

// Services
import AuthService from "./services/auth.service";
import SetupService from './services/setup.service';
import EventBus from "./common/EventBus";

// Components
import Setup from "./components/setup.component";
import Login from "./components/login.component";
import Register from "./components/register.component";
import About from "./components/about.component";
import Profile from "./components/profile.component";
import Admin from "./components/admin.component";
import Moderator from "./components/moderator.component";
import Box from "./components/box.component";
import Organization from "./components/organization.component";
import Version from "./components/version.component";
import Provider from "./components/provider.component";
import Navbar from "./components/navbar.component";

// Assets
import BoxVaultLight from './images/BoxVault.svg';
import BoxVaultDark from './images/BoxVaultDark.svg';

const App = () => {
  const [showAdminBoard, setShowAdminBoard] = useState(false);
  const [showModeratorBoard, setShowModeratorBoard] = useState(false);
  const [currentUser, setCurrentUser] = useState(undefined);
  const [userOrganization, setUserOrganization] = useState("");
  const [gravatarUrl, setGravatarUrl] = useState("");
  const [gravatarFetched, setGravatarFetched] = useState(false);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    return savedTheme ? savedTheme : "light";
  });
  const [setupComplete, setSetupComplete] = useState(null); // Initialize as null to indicate loading
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.setAttribute("data-bs-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    let mounted = true;

    const checkSetup = async () => {
      try {
        const response = await SetupService.isSetupComplete();
        if (!mounted) return;

        setSetupComplete(response.data.setupComplete);
        if (!response.data.setupComplete) {
          navigate("/setup");
        }
      } catch (error) {
        if (!mounted) return;
        console.error('Error checking setup status:', error);
      }
    };

    checkSetup();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const fetchGravatarUrl = useCallback((emailHash) => {
    let mounted = true;

    const loadGravatar = async () => {
      if (!gravatarFetched) {
        try {
          const profile = await AuthService.getGravatarProfile(emailHash);
          if (!mounted) return;

          if (profile?.avatar_url) {
            setGravatarUrl(profile.avatar_url);
          }
          setGravatarFetched(true);
        } catch (error) {
          if (!mounted) return;
          console.error("Error fetching Gravatar:", error);
          setGravatarFetched(true);
        }
      }
    };

    loadGravatar();

    return () => {
      mounted = false;
    };
  }, [gravatarFetched]);

  useEffect(() => {
    const user = AuthService.getCurrentUser();

    if (user) {
      setCurrentUser(user);
      setShowAdminBoard(user.roles.includes("ROLE_ADMIN"));
      setShowModeratorBoard(user.roles.includes("ROLE_MODERATOR"));
      setUserOrganization(user.organization);

      if (user.emailHash) {
        fetchGravatarUrl(user.emailHash);
      }

      // Use the new cleanup function returned by EventBus.on
      const cleanup = EventBus.on("logout", () => {
        logOut();
      });

      return cleanup;
    }
  }, [fetchGravatarUrl]);

  useEffect(() => {
    let mounted = true;
    let intervalId;

    if (currentUser) {
      // Refresh token at 80% of its lifetime (24 hours * 0.8 = 19.2 hours)
      intervalId = setInterval(() => {
        if (mounted) {
          AuthService.refreshUserData().then((updatedUser) => {
            if (mounted && updatedUser) {
              setCurrentUser(updatedUser);
            }
          });
        }
      }, 69120000); // 19.2 hours in milliseconds
    }

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [currentUser]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  const logOut = () => {
    AuthService.logout();
    setShowAdminBoard(false);
    setShowModeratorBoard(false);
    setCurrentUser(undefined);
    setUserOrganization("");
    setGravatarUrl("");
    setGravatarFetched(false);
  };

  if (setupComplete === null) {
    // Show a loading indicator while checking setup status
    return <div>Loading...</div>;
  }


  return (
    <div className="App">
      <Navbar
        currentUser={currentUser}
        userOrganization={userOrganization}
        gravatarUrl={gravatarUrl}
        showAdminBoard={showAdminBoard}
        showModeratorBoard={showModeratorBoard}
        theme={theme}
        toggleTheme={toggleTheme}
        logOut={logOut}
      />
      <div className="container-fluid mt-3">
        <Routes>
          <Route 
            path="/setup" 
            element={
              setupComplete ? <Navigate to="/register" replace /> : <Setup />
            } 
          />
          {setupComplete ? (
            <>
              <Route path="/" element={<Organization showOnlyPublic={true} theme={theme} />} />
              <Route path="/about" element={<About />} />
              <Route path="/login" element={<Login theme={theme} />} />
              <Route path="/register" element={<Register theme={theme} />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/moderator" element={<Moderator currentOrganization={userOrganization} />} />
              <Route path="/:organization" element={<Organization showOnlyPublic={false} theme={theme} />} />
              <Route path="/:organization/:name" element={<Box theme={theme} />} />
              <Route path="/:organization/:name/:version" element={<Version />} />
              <Route path="/:organization/:name/:version/:providerName" element={<Provider />} />
              <Route path="*" element={<Navigate to="/" />} />
            </>
          ) : (
            <Route path="*" element={<Navigate to="/setup" replace />} />
          )}
        </Routes>
      </div>
    </div>
  );
};

export default App;
