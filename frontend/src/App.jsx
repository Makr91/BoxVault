import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { FaTriangleExclamation } from 'react-icons/fa6';
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';

import './css/styles.css';
import './css/fonts.css';
import './css/auth.css';
import ErrorBoundary from './common/ErrorBoundary';
import EventBus from './common/EventBus';
import About from './components/about.component';
import Admin from './components/admin.component';
import AuthCallback from './components/AuthCallback';
import Box from './components/box.component';
import Footer from './components/Footer.component';
import InviteAccept from './components/InviteAccept.component';
import Login from './components/login.component';
import Navbar from './components/navbar.component';
import OrgConsole from './components/org-console.component';
import OrganizationDiscovery from './components/organization-discovery.component';
import Organization from './components/organization.component';
import Profile from './components/profile.component';
import Provider from './components/provider.component';
import Register from './components/register.component';
import Setup from './components/setup.component';
import Version from './components/version.component';
import AuthService from './services/auth.service';
import SetupService from './services/setup.service';
import UserService from './services/user.service';
import { log } from './utils/Logger';
import { isOrgManager } from './utils/permissions';
import {
  isPushEnabled,
  syncSubscription,
  listenForSubscriptionChange,
} from './utils/pushNotifications';
import { subscribeSessionEvents } from './utils/sessionEvents';

const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)';

const subscribeToColorScheme = onChange => {
  const query = window.matchMedia(DARK_SCHEME_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};

const systemPrefersDark = () => window.matchMedia(DARK_SCHEME_QUERY).matches;

// Every candidate is checked against the membership list because the primary
// organization can name an org the user was just removed from — an unvalidated
// one is then sent on every org-scoped request, which answers 403.
const resolveActiveOrganization = (user, stored) => {
  if (!user) {
    return '';
  }
  if (!Array.isArray(user.organizations)) {
    return stored || user.organization || '';
  }

  const names = user.organizations.map(org => org.name).filter(Boolean);
  if (stored && names.includes(stored)) {
    return stored;
  }
  if (user.organization && names.includes(user.organization)) {
    return user.organization;
  }
  return names[0] || '';
};

const App = () => {
  const { t, i18n } = useTranslation();
  const isDevelopment = import.meta.env.NODE_ENV === 'development';

  // Initialize Bootstrap
  useEffect(() => {
    let bootstrap;
    const loadBootstrap = async () => {
      bootstrap = await import('bootstrap/dist/js/bootstrap.bundle.min.js');
    };
    loadBootstrap();
    return () => {
      // Clean up Bootstrap
      if (bootstrap && bootstrap.Modal) {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
          const instance = bootstrap.Modal.getInstance(modal);
          if (instance) {
            instance.dispose();
          }
        });
      }
    };
  }, []);

  const [showAdminBoard, setShowAdminBoard] = useState(() =>
    Boolean(AuthService.getCurrentUser()?.roles?.includes('ROLE_ADMIN'))
  );
  const [currentUser, setCurrentUser] = useState(() => AuthService.getCurrentUser() || undefined);
  const [userOrganization, setUserOrganization] = useState(
    () => AuthService.getCurrentUser()?.organization || ''
  );
  const [activeOrganization, setActiveOrganization] = useState(() =>
    resolveActiveOrganization(
      AuthService.getCurrentUser(),
      localStorage.getItem('activeOrganization')
    )
  );
  // Tier one of the avatar contract: the stored avatar URL from the login
  // payload. The Gravatar email-hash fetch below stays as tier two.
  const [gravatarUrl, setGravatarUrl] = useState(
    () => AuthService.getCurrentUser()?.avatarUrl || ''
  );
  const [gravatarFetched, setGravatarFetched] = useState(false);
  // The account's stored preference outranks this browser's, so the same person
  // gets the same colour scheme on every device. It is read here and at login
  // rather than from an effect: an effect would re-assert a value that goes
  // stale the moment the toggle is used, undoing the click.
  const [themePreference, setThemePreference] = useState(
    () => AuthService.getCurrentUser()?.preferredTheme || localStorage.getItem('theme') || 'auto'
  );
  const prefersDark = useSyncExternalStore(subscribeToColorScheme, systemPrefersDark);
  // What gets stored is the PREFERENCE; what gets applied is the resolved
  // light/dark. Keeping them separate is what lets "auto" keep tracking the OS
  // instead of freezing at whatever it happened to resolve to on first load.
  const theme = themePreference === 'auto' ? (prefersDark && 'dark') || 'light' : themePreference;
  const [setupComplete, setSetupComplete] = useState(null); // Initialize as null to indicate loading
  const [sessionEnded, setSessionEnded] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', themePreference);

    const favicon = document.getElementById('favicon');
    if (favicon) {
      favicon.href = theme === 'dark' ? '/dark-favicon.ico' : '/favicon.ico';
    }
  }, [theme, themePreference]);

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
          navigate('/setup');
        }
      } catch (error) {
        if (!mounted) {
          return;
        }
        log.app.error('Error checking setup status', { error: error.message });
      }
    };

    checkSetup();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const fetchGravatarUrl = useCallback(
    emailHash => {
      const controller = new AbortController();

      const loadGravatar = async () => {
        if (!gravatarFetched) {
          try {
            const profile = await AuthService.getGravatarProfile(emailHash, controller.signal);
            if (profile?.avatar_url) {
              setGravatarUrl(profile.avatar_url);
            }
            setGravatarFetched(true);
          } catch (error) {
            if (error.name !== 'AbortError') {
              log.api.error('Error fetching Gravatar', {
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

  // Organization context side effects: persist the default active org and load
  // the user's avatar. Initial state is derived in the useState initializers
  // above, so this effect performs no synchronous state updates.
  useEffect(() => {
    const user = AuthService.getCurrentUser();

    if (user) {
      if (activeOrganization) {
        localStorage.setItem('activeOrganization', activeOrganization);
      } else {
        localStorage.removeItem('activeOrganization');
      }

      if (!user.avatarUrl && user.emailHash) {
        fetchGravatarUrl(user.emailHash);
      }
    } else {
      localStorage.removeItem('activeOrganization');
    }
  }, [activeOrganization, fetchGravatarUrl]);

  // Handle organization switching
  const handleOrganizationSwitch = useCallback(
    newOrgName => {
      setActiveOrganization(newOrgName);
      localStorage.setItem('activeOrganization', newOrgName);

      log.app.info('Organization switched', {
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
    setCurrentUser(undefined);
    setUserOrganization('');
    setGravatarUrl('');
    setGravatarFetched(false);
  }, []);

  const logOutLocal = useCallback(() => {
    AuthService.logoutLocal();
    setShowAdminBoard(false);
    setCurrentUser(undefined);
    setUserOrganization('');
    setGravatarUrl('');
    setGravatarFetched(false);
  }, []);

  // The write-through is fire-and-forget: the toggle must feel instant, and a
  // preference that failed to persist is worth a log line, not a blocked
  // click. It lives here rather than inside the state updater because React
  // may invoke an updater more than once for a single change.
  const applyThemePreference = useCallback((preference, { persistRemotely = true } = {}) => {
    setThemePreference(preference);

    if (!persistRemotely || !AuthService.getCurrentUser()) {
      return;
    }

    UserService.updatePreferences({ theme: preference })
      .then(() => {
        // Keep the stored session in step, or the next mount would re-apply
        // the value this click just replaced.
        const stored = AuthService.getCurrentUser();
        if (stored) {
          localStorage.setItem('user', JSON.stringify({ ...stored, preferredTheme: preference }));
        }
      })
      .catch(error => {
        log.app.error('Theme preference not saved', { error: error.message });
      });
  }, []);

  // auto -> light -> dark -> auto
  const toggleTheme = () => {
    const next =
      (themePreference === 'auto' && 'light') || (themePreference === 'light' && 'dark') || 'auto';
    applyThemePreference(next);
  };

  useEffect(() => {
    // Set up EventBus listeners independently of user state
    const logoutCleanup = EventBus.on('logout', () => {
      logOut();
    });

    const sessionEndedCleanup = EventBus.on('sessionEnded', detail => {
      setCurrentUser(undefined);
      setShowAdminBoard(false);
      setUserOrganization('');
      setGravatarUrl('');
      setGravatarFetched(false);
      setSessionEnded({ returnTo: detail?.returnTo || '/' });
    });

    const loginCleanup = EventBus.on('login', userData => {
      setSessionEnded(null);
      setCurrentUser(userData);
      setShowAdminBoard(userData.roles && userData.roles.includes('ROLE_ADMIN'));
      setUserOrganization(userData.organization);

      if (userData.preferredTheme) {
        setThemePreference(userData.preferredTheme);
      }

      // The active-org state is seeded at mount, before any login has happened,
      // so it must be re-derived here or every org-scoped page renders with an
      // empty organization until the next full page load.
      const nextOrganization = resolveActiveOrganization(
        userData,
        localStorage.getItem('activeOrganization')
      );

      setActiveOrganization(nextOrganization);
      if (nextOrganization) {
        localStorage.setItem('activeOrganization', nextOrganization);
      } else {
        localStorage.removeItem('activeOrganization');
      }

      if (userData.avatarUrl) {
        setGravatarUrl(userData.avatarUrl);
      } else if (userData.emailHash) {
        fetchGravatarUrl(userData.emailHash);
      }
    });

    const organizationUpdateCleanup = EventBus.on('organizationUpdated', data => {
      setUserOrganization(data.newName);
      // Use functional update to avoid stale closure
      setCurrentUser(c => (c ? { ...c, organization: data.newName } : c));

      // Update activeOrganization if it matches the renamed organization
      setActiveOrganization(currentActive => {
        if (currentActive === data.oldName) {
          localStorage.setItem('activeOrganization', data.newName);
          return data.newName;
        }
        return currentActive;
      });
    });

    return () => {
      logoutCleanup();
      sessionEndedCleanup();
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
          AuthService.refreshUserData().then(updatedUser => {
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

  // i18next is an external system, so pushing the account's language into it is
  // exactly what an effect is for. It runs only while the two disagree, and the
  // stored copy is kept current by the switcher, so this cannot fight a user's
  // own choice.
  useEffect(() => {
    const preferred = currentUser?.preferredLanguage;
    if (preferred && preferred !== i18n.language) {
      i18n.changeLanguage(preferred);
    }
  }, [currentUser, i18n]);

  useEffect(() => {
    if (!currentUser || !isPushEnabled()) {
      return undefined;
    }
    const reportSyncFailure = error => {
      log.app.error('Push subscription sync failed', {
        error: error.message,
      });
    };
    syncSubscription().catch(reportSyncFailure);
    return listenForSubscriptionChange(reportSyncFailure);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.accessToken) {
      return undefined;
    }
    return subscribeSessionEvents(currentUser.accessToken);
  }, [currentUser]);

  if (setupComplete === null) {
    // Show a loading indicator while checking setup status
    return <div>{t('loading')}</div>;
  }

  // The organization-management board is gated per-org (org admin/owner of
  // the active organization, or global admin) — mirrors verifyOrgAccess.
  const showOrgConsole = isOrgManager(currentUser, activeOrganization);

  return (
    <ErrorBoundary showErrorDetails={isDevelopment}>
      <div className="App d-flex flex-column min-vh-100">
        <Navbar
          currentUser={currentUser}
          userOrganization={userOrganization}
          activeOrganization={activeOrganization}
          onOrganizationSwitch={handleOrganizationSwitch}
          gravatarUrl={gravatarUrl}
          showAdminBoard={showAdminBoard}
          showOrgConsole={showOrgConsole}
          theme={theme}
          themePreference={themePreference}
          toggleTheme={toggleTheme}
          logOut={logOut}
          logOutLocal={logOutLocal}
        />
        {sessionEnded && (
          <div
            className="alert alert-warning d-flex align-items-center gap-3 mx-3 mt-3 mb-0"
            role="alert"
          >
            <FaTriangleExclamation className="flex-shrink-0" />
            <div className="flex-grow-1">
              <strong>{t('sessionEnded.title')}</strong>
              <div className="small">{t('sessionEnded.body')}</div>
            </div>
            <Link
              to={`/login?returnTo=${encodeURIComponent(sessionEnded.returnTo)}`}
              className="btn btn-primary btn-sm"
              onClick={() => setSessionEnded(null)}
            >
              {t('sessionEnded.signIn')}
            </Link>
          </div>
        )}
        <div className="container-fluid mt-3 flex-grow-1">
          <Routes>
            <Route
              path="/setup"
              element={setupComplete ? <Navigate to="/register" replace /> : <Setup />}
            />
            {setupComplete ? (
              <>
                <Route path="/" element={<Organization showOnlyPublic theme={theme} />} />
                <Route path="/about" element={<About />} />
                <Route
                  path="/organizations/discover"
                  element={<OrganizationDiscovery theme={theme} />}
                />
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/register" element={<Register />} />
                <Route path="/invite/:token" element={<InviteAccept />} />
                <Route
                  path="/profile"
                  element={<Profile activeOrganization={activeOrganization} />}
                />
                <Route path="/admin" element={<Admin />} />
                <Route
                  path="/org-console"
                  element={<OrgConsole currentOrganization={activeOrganization} />}
                />
                <Route
                  path="/:organization"
                  element={<Organization showOnlyPublic={false} theme={theme} />}
                />
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
        <Footer />
      </div>
    </ErrorBoundary>
  );
};

export default App;
