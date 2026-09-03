import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Routes, Route, Navigate, useNavigate, useParams, Link } from 'react-router-dom';

import './css/styles.css';
import './css/fonts.css';
import './css/auth.css';
import About from './About';
import { useTheme } from './chrome';
import {
  APP_NAME,
  BrandLogo,
  isPushEnabled,
  listenForSubscriptionChange,
  persistTheme,
  syncSubscription,
} from './chromeProps';
import { boxes, collections, isos } from './collections';
import EventBus from './common/EventBus';
import Admin from './components/admin.component';
import AuthCallback from './components/AuthCallback';
import InviteAccept from './components/InviteAccept.component';
import Login from './components/login.component';
import OrgConsole from './components/org-console.component';
import OrganizationDiscovery from './components/organization-discovery.component';
import Profile from './components/profile.component';
import Register from './components/register.component';
import Setup from './components/setup.component';
import {
  CollectionPage,
  HomePage,
  ItemPage,
  OrgPage,
  ProviderPage,
  VersionPage,
  formatFileSize,
  pageContextShape,
} from './pages';
import AuthService from './services/auth.service';
import SetupService from './services/setup.service';
import Shell from './shell';
import { log } from './utils/Logger';
import { isOrgManager, isOrgMember } from './utils/permissions';
import { subscribeSessionEvents } from './utils/sessionEvents';

const PREFS_PREFIX = 'boxvault_table_prefs';

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

const DiscoverLink = () => {
  const { t } = useTranslation();
  return (
    <Link to="/organizations/discover" className="btn btn-sm btn-outline-primary">
      {t('discovery.discoverButton')}
    </Link>
  );
};

const OrgRoute = ({ context }) => {
  const { organization } = useParams();
  return (
    <OrgPage
      collections={collections}
      org={organization}
      member={isOrgMember(context.user, organization)}
      context={context}
    />
  );
};

OrgRoute.propTypes = {
  context: pageContextShape.isRequired,
};

const OrgIsosRoute = ({ context }) => {
  const { organization } = useParams();
  return (
    <CollectionPage
      collection={isos}
      org={organization}
      member={isOrgMember(context.user, organization)}
      context={context}
    />
  );
};

OrgIsosRoute.propTypes = {
  context: pageContextShape.isRequired,
};

const ItemRoute = ({ context }) => {
  const { organization, name } = useParams();
  return <ItemPage collection={boxes} org={organization} name={name} context={context} />;
};

ItemRoute.propTypes = {
  context: pageContextShape.isRequired,
};

const IsoItemRoute = ({ context }) => {
  const { organization, name } = useParams();
  return <ItemPage collection={isos} org={organization} name={name} context={context} />;
};

IsoItemRoute.propTypes = {
  context: pageContextShape.isRequired,
};

const VersionRoute = ({ context }) => {
  const { organization, name, version } = useParams();
  return (
    <VersionPage
      collection={boxes}
      org={organization}
      name={name}
      version={version}
      context={context}
    />
  );
};

VersionRoute.propTypes = {
  context: pageContextShape.isRequired,
};

const ProviderRoute = ({ context }) => {
  const { organization, name, version, providerName } = useParams();
  return (
    <ProviderPage
      collection={boxes}
      org={organization}
      name={name}
      version={version}
      provider={providerName}
      context={context}
    />
  );
};

ProviderRoute.propTypes = {
  context: pageContextShape.isRequired,
};

const App = () => {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    let bootstrap;
    const loadBootstrap = async () => {
      bootstrap = await import('bootstrap/dist/js/bootstrap.bundle.min.js');
    };
    loadBootstrap();
    return () => {
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
  const [activeOrganization, setActiveOrganization] = useState(() =>
    resolveActiveOrganization(
      AuthService.getCurrentUser(),
      localStorage.getItem('activeOrganization')
    )
  );
  const [gravatarUrl, setGravatarUrl] = useState(
    () => AuthService.getCurrentUser()?.avatarUrl || ''
  );
  const [gravatarFetched, setGravatarFetched] = useState(false);
  const {
    theme,
    preference: themePreference,
    setPreference: setThemePreference,
    toggleTheme,
  } = useTheme({
    initialPreference: AuthService.getCurrentUser()?.preferredTheme || '',
    onPersist: persistTheme,
  });
  const [setupComplete, setSetupComplete] = useState(null);
  const [sessionEnded, setSessionEnded] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const favicon = document.getElementById('favicon');
    if (favicon) {
      favicon.href = theme === 'dark' ? '/dark-favicon.ico' : '/favicon.ico';
    }
  }, [theme]);

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

  const handleOrganizationSwitch = useCallback(
    newOrgName => {
      setActiveOrganization(newOrgName);
      localStorage.setItem('activeOrganization', newOrgName);

      log.app.info('Organization switched', {
        from: activeOrganization,
        to: newOrgName,
      });
    },
    [activeOrganization]
  );

  const logOut = useCallback(() => {
    AuthService.logout();
    setShowAdminBoard(false);
    setCurrentUser(undefined);
    setGravatarUrl('');
    setGravatarFetched(false);
  }, []);

  const logOutLocal = useCallback(() => {
    AuthService.logoutLocal();
    setShowAdminBoard(false);
    setCurrentUser(undefined);
    setGravatarUrl('');
    setGravatarFetched(false);
  }, []);

  useEffect(() => {
    const logoutCleanup = EventBus.on('logout', () => {
      logOut();
    });

    const sessionEndedCleanup = EventBus.on('sessionEnded', detail => {
      setCurrentUser(undefined);
      setShowAdminBoard(false);
      setGravatarUrl('');
      setGravatarFetched(false);
      setSessionEnded({ returnTo: detail?.returnTo || '/' });
    });

    const loginCleanup = EventBus.on('login', userData => {
      setSessionEnded(null);
      setCurrentUser(userData);
      setShowAdminBoard(userData.roles && userData.roles.includes('ROLE_ADMIN'));

      if (userData.preferredTheme) {
        setThemePreference(userData.preferredTheme, { persist: false });
      }
      if (userData.preferredLanguage && userData.preferredLanguage !== i18n.language) {
        i18n.changeLanguage(userData.preferredLanguage);
      }

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
      setCurrentUser(c => (c ? { ...c, organization: data.newName } : c));

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
  }, [fetchGravatarUrl, i18n, logOut, logOutLocal, setThemePreference]);

  useEffect(() => {
    let mounted = true;
    let intervalId;

    if (currentUser) {
      intervalId = setInterval(() => {
        if (mounted) {
          AuthService.refreshUserData().then(updatedUser => {
            if (mounted && updatedUser) {
              setCurrentUser(updatedUser);
            }
          });
        }
      }, 69120000);
    }

    return () => {
      mounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [currentUser]);

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
    return <div>{t('loading')}</div>;
  }

  const showOrgConsole = isOrgManager(currentUser, activeOrganization);

  const context = {
    user: currentUser || null,
    orgMark: <BrandLogo theme={theme} className="logo-xl icon-with-margin-sm" />,
    prefsPrefix: PREFS_PREFIX,
    appName: APP_NAME,
    formatFileSize,
  };

  const homeElement = (
    <HomePage collections={collections} context={context} actions={<DiscoverLink />} />
  );

  return (
    <Shell
      currentUser={currentUser}
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
      sessionEnded={sessionEnded}
    >
      <Routes>
        <Route
          path="/setup"
          element={setupComplete ? <Navigate to="/register" replace /> : <Setup />}
        />
        {setupComplete ? (
          <>
            <Route path="/" element={homeElement} />
            <Route
              path="/isos"
              element={<CollectionPage collection={isos} org="" member={false} context={context} />}
            />
            <Route path="/about" element={<About theme={theme} />} />
            <Route
              path="/organizations/discover"
              element={<OrganizationDiscovery theme={theme} />}
            />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/register" element={<Register />} />
            <Route path="/invite/:token" element={<InviteAccept />} />
            <Route path="/profile" element={<Profile activeOrganization={activeOrganization} />} />
            <Route path="/admin" element={<Admin />} />
            <Route
              path="/org-console"
              element={<OrgConsole currentOrganization={activeOrganization} />}
            />
            <Route path="/:organization" element={<OrgRoute context={context} />} />
            <Route path="/:organization/isos" element={<OrgIsosRoute context={context} />} />
            <Route path="/:organization/isos/:name" element={<IsoItemRoute context={context} />} />
            <Route path="/:organization/:name" element={<ItemRoute context={context} />} />
            <Route
              path="/:organization/:name/:version"
              element={<VersionRoute context={context} />}
            />
            <Route
              path="/:organization/:name/:version/:providerName"
              element={<ProviderRoute context={context} />}
            />
            <Route path="*" element={<Navigate to="/" />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/setup" replace />} />
        )}
      </Routes>
    </Shell>
  );
};

export default App;
