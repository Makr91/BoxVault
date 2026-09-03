import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Routes, Route, Navigate, useNavigate, useParams, Link } from 'react-router-dom';

import './css/styles.css';
import './css/fonts.css';
import './css/auth.css';
import About from './About';
import { useTheme } from './chrome';
import {
  ACTIVE_ORG_KEY,
  APP_NAME,
  BrandLogo,
  events,
  push,
  returnTo,
  session,
} from './chromeProps';
import { boxes, collections, isos } from './collections';
import Admin from './components/admin.component';
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
import { CallbackPage, subscribeTerminateStream, useSession } from './session';
import Shell from './shell';
import { log } from './utils/Logger';
import { isOrgManager, isOrgMember } from './utils/permissions';

const PREFS_PREFIX = 'boxvault_table_prefs';
const PROFILE_RELOAD_MS = 69120000;

const persistTheme = preference => session.savePreferences({ theme: preference });

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
  const navigate = useNavigate();
  const account = useSession({
    provider: session,
    events,
    returnTo,
    activeOrgKey: ACTIVE_ORG_KEY,
    push,
  });
  const { user, activeOrgUuid: activeOrganization, reload } = account;
  const [gravatar, setGravatar] = useState(null);
  const [setupComplete, setSetupComplete] = useState(null);
  const {
    theme,
    preference: themePreference,
    setPreference: setThemePreference,
    toggleTheme,
  } = useTheme({
    initialPreference: session.current()?.preferredTheme || '',
    onPersist: persistTheme,
  });

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

  useEffect(() => {
    if (user?.preferredTheme) {
      setThemePreference(user.preferredTheme, { persist: false });
    }
  }, [user?.preferredTheme, setThemePreference]);

  useEffect(() => {
    if (user?.preferredLanguage && user.preferredLanguage !== i18n.language) {
      i18n.changeLanguage(user.preferredLanguage);
    }
  }, [user?.preferredLanguage, i18n]);

  useEffect(() => {
    const emailHash = user && !user.avatarUrl ? user.emailHash : '';
    if (!emailHash) {
      return undefined;
    }
    const controller = new AbortController();
    AuthService.getGravatarProfile(emailHash, controller.signal).then(profile => {
      if (profile?.avatar_url) {
        setGravatar({ emailHash, url: profile.avatar_url });
      }
    });
    return () => {
      controller.abort();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }
    const timer = setInterval(reload, PROFILE_RELOAD_MS);
    return () => {
      clearInterval(timer);
    };
  }, [user, reload]);

  useEffect(() => {
    const token = user?.accessToken;
    if (!token) {
      return undefined;
    }
    return subscribeTerminateStream({
      url: `${window.location.origin}/api/notifications/events`,
      headers: { 'x-access-token': token },
      onEnded: () => events.endSession(),
    });
  }, [user?.accessToken]);

  if (setupComplete === null) {
    return <div>{t('loading')}</div>;
  }

  const fetchedGravatar = gravatar?.emailHash === user?.emailHash ? gravatar?.url || '' : '';
  const gravatarUrl = user ? user.avatarUrl || fetchedGravatar : '';
  const showAdminBoard = Boolean(user?.roles?.includes('ROLE_ADMIN'));
  const showOrgConsole = isOrgManager(user, activeOrganization);

  const handleSignOut = () => {
    account.signOut();
    navigate('/');
  };

  const afterSignIn = () => navigate(returnTo.consume() || '/', { replace: true });

  const context = {
    user,
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
      account={account}
      gravatarUrl={gravatarUrl}
      showAdminBoard={showAdminBoard}
      showOrgConsole={showOrgConsole}
      theme={theme}
      themePreference={themePreference}
      toggleTheme={toggleTheme}
      onSignOut={handleSignOut}
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
            <Route
              path="/auth/callback"
              element={<CallbackPage complete={session.complete} onDone={afterSignIn} />}
            />
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
