import { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";

import "./scss/styles.scss";
import ErrorBoundary from "./common/ErrorBoundary";
import EventBus from "./common/EventBus";
import About from "./components/about.component";
import Admin from "./components/admin.component";
import AuthCallback from "./components/AuthCallback";
import Box from "./components/box.component";
import Login from "./components/login.component";
import Moderator from "./components/moderator.component";
import Navbar from "./components/navbar.component";
import OrganizationDiscovery from "./components/organization-discovery.component";
import Organization from "./components/organization.component";
import Profile from "./components/profile.component";
import Provider from "./components/provider.component";
import Register from "./components/register.component";
import Setup from "./components/setup.component";
import Version from "./components/version.component";
import AuthService from "./services/auth.service";
import SetupService from "./services/setup.service";
import { log } from "./utils/Logger";

const App = () => {
  const isDevelopment = import.meta.env.NODE_ENV === "development";

  // Initialize Bootstrap
  useEffect(() => {
    let bootstrap;
    const loadBootstrap = async () => {
      bootstrap = await import("bootstrap/dist/js/bootstrap.bundle.min.js");
    };
    loadBootstrap();
    return () => {
      // Clean up Bootstrap
      if (bootstrap && bootstrap.Modal) {
        const modals = document.querySelectorAll(".modal");
        modals.forEach((modal) => {
          const instance = bootstrap.Modal.getInstance(modal);
          if (instance) {
            instance.dispose();
          }
        });
      }
    };
  }, []);

  const [showAdminBoard, setShowAdminBoard] = useState(false);
  const [showModeratorBoard, setShowModeratorBoard] = useState(false);
  const [currentUser, setCurrentUser] = useState(undefined);
  const [userOrganization, setUserOrganization] = useState("");
  const [activeOrganization, setActiveOrganization] = useState("");
  const [gravatarUrl, setGravatarUrl] = useState("");
  const [gravatarFetched, setGravatarFetched] = useState(false);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme;
    }

    // Detect system theme preference
    if (window.matchMedia) {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      return prefersDark ? "dark" : "dark"; // Default to dark in all cases
    }

    return "dark"; // Fallback to dark
  });
  const [setupComplete, setSetupComplete] = useState(null); // Initialize as null to indicate loading
  const navigate = useNavigate();

  useEffect(() => {
    // Update theme in DOM and localStorage
    document.documentElement.setAttribute("data-bs-theme", theme);
    localStorage.setItem("theme", theme);

    // Update favicon based on theme
    const favicon = document.getElementById("favicon");
    if (favicon) {
      favicon.href = theme === "dark" ? "/dark-favicon.ico" : "/favicon.ico";
    }
  }, [theme]);

  useEffect(() => {
    // Listen to system theme changes only if user hasn't set a manual preference
    const savedTheme = localStorage.getItem("theme");

    if (!savedTheme && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e) => {
        const newTheme = e.matches ? "dark" : "light";
        setTheme(newTheme);
        log.app.debug("System theme changed", { newTheme });
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    return undefined;
  }, []);

  useEffect(() => {
    let mounted = true;

    const checkSetup = async () => {
      try {
        const response = await SetupService.isSetupComplete();
        if (!mounted) {
          return;
        }

        setSetupComplete(response.data.setupComplete);
        if (!response.data.setupComplete) {
          navigate("/setup");
        }
      } catch (error) {
        if (!mounted) {
          return;
        }
        log.app.error("Error checking setup status", { error: error.message });
      }
    };

    checkSetup();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const fetchGravatarUrl = useCallback(
    (emailHash) => {
      const controller = new AbortController();

      const loadGravatar = async () => {
        if (!gravatarFetched) {
          try {
            const profile = await AuthService.getGravatarProfile(
              emailHash,
              controller.signal
            );
            if (profile?.avatar_url) {
              setGravatarUrl(profile.avatar_url);
            }
            setGravatarFetched(true);
          } catch (error) {
            if (error.name !== "AbortError") {
              log.api.error("Error fetching Gravatar", {
                emailHash,
                error: error.message,
              });
              setGravatarFetched(true);
            }
          }
        }
      };

      loadGravatar();

      return () => {
        controller.abort();
      };
    },
    [gravatarFetched]
  );

  // Organization context management
  useEffect(() => {
    const user = AuthService.getCurrentUser();

    if (user) {
      setCurrentUser(user);
      setShowAdminBoard(user.roles && user.roles.includes("ROLE_ADMIN"));
      setShowModeratorBoard(
        user.roles && user.roles.includes("ROLE_MODERATOR")
      );
      setUserOrganization(user.organization);

      // Set active organization from localStorage or default to user's org
      const savedActiveOrg = localStorage.getItem("activeOrganization");
      if (savedActiveOrg) {
        setActiveOrganization(savedActiveOrg);
      } else {
        setActiveOrganization(user.organization);
        localStorage.setItem("activeOrganization", user.organization);
      }

      if (user.emailHash) {
        fetchGravatarUrl(user.emailHash);
      }
    } else {
      // Clear organization context when user logs out
      setActiveOrganization("");
      localStorage.removeItem("activeOrganization");
    }
  }, [fetchGravatarUrl]);

  // Handle organization switching
  const handleOrganizationSwitch = useCallback(
    (newOrgName) => {
      setActiveOrganization(newOrgName);
      localStorage.setItem("activeOrganization", newOrgName);

      log.app.info("Organization switched", {
        from: activeOrganization,
        to: newOrgName,
      });

      // Navigate to the new organization's page
      navigate(`/${newOrgName}`);
    },
    [activeOrganization, navigate]
  );

  const logOut = useCallback(() => {
    AuthService.logout();
    setShowAdminBoard(false);
    setShowModeratorBoard(false);
    setCurrentUser(undefined);
    setUserOrganization("");
    setGravatarUrl("");
    setGravatarFetched(false);
  }, []);

  const logOutLocal = useCallback(() => {
    AuthService.logoutLocal();
    setShowAdminBoard(false);
    setShowModeratorBoard(false);
    setCurrentUser(undefined);
    setUserOrganization("");
    setGravatarUrl("");
    setGravatarFetched(false);
  }, []);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  useEffect(() => {
    // Set up EventBus listeners independently of user state
    const logoutCleanup = EventBus.on("logout", () => {
      logOut();
    });

    const loginCleanup = EventBus.on("login", (userData) => {
      setCurrentUser(userData);
      setShowAdminBoard(
        userData.roles && userData.roles.includes("ROLE_ADMIN")
      );
      setShowModeratorBoard(
        userData.roles && userData.roles.includes("ROLE_MODERATOR")
      );
      setUserOrganization(userData.organization);

      if (userData.emailHash) {
        fetchGravatarUrl(userData.emailHash);
      }
    });

    const organizationUpdateCleanup = EventBus.on(
      "organizationUpdated",
      (data) => {
        setUserOrganization(data.newName);
        // Use functional update to avoid stale closure
        setCurrentUser((c) => (c ? { ...c, organization: data.newName } : c));
      }
    );

    return () => {
      logoutCleanup();
      loginCleanup();
      organizationUpdateCleanup();
    };
  }, [fetchGravatarUrl, logOut, logOutLocal]);

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

  if (setupComplete === null) {
    // Show a loading indicator while checking setup status
    return <div>Loading...</div>;
  }

  return (
    <ErrorBoundary showErrorDetails={isDevelopment}>
      <div className="App">
        <Navbar
          currentUser={currentUser}
          userOrganization={userOrganization}
          activeOrganization={activeOrganization}
          onOrganizationSwitch={handleOrganizationSwitch}
          gravatarUrl={gravatarUrl}
          showAdminBoard={showAdminBoard}
          showModeratorBoard={showModeratorBoard}
          theme={theme}
          toggleTheme={toggleTheme}
          logOut={logOut}
          logOutLocal={logOutLocal}
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
                <Route
                  path="/"
                  element={<Organization showOnlyPublic theme={theme} />}
                />
                <Route path="/about" element={<About />} />
                <Route
                  path="/organizations/discover"
                  element={<OrganizationDiscovery theme={theme} />}
                />
                <Route path="/login" element={<Login theme={theme} />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/register" element={<Register theme={theme} />} />
                <Route
                  path="/profile"
                  element={<Profile activeOrganization={activeOrganization} />}
                />
                <Route path="/admin" element={<Admin />} />
                <Route
                  path="/moderator"
                  element={<Moderator currentOrganization={userOrganization} />}
                />
                <Route
                  path="/:organization"
                  element={
                    <Organization showOnlyPublic={false} theme={theme} />
                  }
                />
                <Route
                  path="/:organization/:name"
                  element={<Box theme={theme} />}
                />
                <Route
                  path="/:organization/:name/:version"
                  element={<Version />}
                />
                <Route
                  path="/:organization/:name/:version/:providerName"
                  element={<Provider />}
                />
                <Route path="*" element={<Navigate to="/" />} />
              </>
            ) : (
              <Route path="*" element={<Navigate to="/setup" replace />} />
            )}
          </Routes>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default App;
