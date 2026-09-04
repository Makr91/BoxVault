import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Routes, Route, Navigate, useNavigate, useParams, Link } from 'react-router-dom';

import './css/styles.css';
import './css/fonts.css';
import About from './About';
import { log, useTheme } from './chrome';
import {
  ACTIVE_ORG_KEY,
  APP_NAME,
  BrandLogo,
  JOIN_INTENT_KEY,
  LOGIN_METHOD_KEY,
  SILENT_SSO_KEY,
  events,
  i18n,
  push,
  returnTo,
  session,
} from './chromeProps';
import { boxes, collections, isos } from './collections';
import Admin from './components/admin.component';
import Setup from './components/setup.component';
import {
  CollectionPage,
  DiscoveryPage,
  HomePage,
  InvitePage,
  ItemPage,
  LoginPage,
  OrgConsolePage,
  OrgPage,
  ProfilePage,
  ProviderPage,
  RegisterPage,
  VersionPage,
  formatFileSize,
  pageContextShape,
} from './pages';
import { api } from './services/api';
import { CallbackPage, subscribeTerminateStream, useSession } from './session';
import Shell from './shell';
import { isGlobalAdmin, isOrgManager, isOrgMember } from './utils/permissions';

const PREFS_PREFIX = 'boxvault_table_prefs';
const PROFILE_RELOAD_MS = 69120000;

const authAdapter = {
  ...api.auth,
  loginMethodKey: LOGIN_METHOD_KEY,
  silentSsoKey: SILENT_SSO_KEY,
};

const accountAdapter = {
  gravatarProfile: api.gravatar.profile,
  changePassword: api.users.changePassword,
  changeEmail: api.users.changeEmail,
  changeName: api.users.changeName,
  remove: api.users.remove,
  verifyMail: api.auth.verifyMail,
  resendVerification: api.auth.resendVerification,
  organizations: api.users.organizations,
  leave: api.users.leave,
  setPrimary: api.users.setPrimary,
  requests: api.requests.mine,
  cancelRequest: api.requests.cancel,
  serviceAccounts: api.serviceAccounts,
};

const organizationsAdapter = {
  get: api.organizations.get,
  update: api.organizations.update,
  accessMode: api.organizations.accessMode,
  users: api.organizations.users,
  memberRole: api.organizations.memberRole,
  removeMember: api.organizations.removeMember,
  invite: api.auth.invite,
  invitations: api.invitations.active,
  removeInvitation: api.invitations.remove,
  requests: api.requests.forOrg,
  approveRequest: api.requests.approve,
  denyRequest: api.requests.deny,
  discover: api.organizations.discover,
  join: api.requests.create,
  gravatarProfile: api.gravatar.profile,
};

const persistTheme = preference => session.savePreferences({ theme: preference });

const DiscoveryRoute = ({ theme }) => (
  <DiscoveryPage
    session={session}
    returnTo={returnTo}
    organizations={organizationsAdapter}
    orgMark={<BrandLogo theme={theme} className="logo-lg icon-with-margin" />}
    joinIntentKey={JOIN_INTENT_KEY}
  />
);

DiscoveryRoute.propTypes = {
  theme: PropTypes.string.isRequired,
};

const OrgConsoleRoute = ({ org, admin }) => (
  <OrgConsolePage
    session={session}
    activeOrgKey={ACTIVE_ORG_KEY}
    organizations={organizationsAdapter}
    org={org}
    admin={admin}
  />
);

OrgConsoleRoute.propTypes = {
  org: PropTypes.string.isRequired,
  admin: PropTypes.bool.isRequired,
};

const ProfileRoute = ({ activeOrgUuid }) => (
  <ProfilePage
    session={session}
    events={events}
    returnTo={returnTo}
    account={accountAdapter}
    activeOrgUuid={activeOrgUuid}
  />
);

ProfileRoute.propTypes = {
  activeOrgUuid: PropTypes.string.isRequired,
};

const LoginRoute = () => (
  <LoginPage session={session} returnTo={returnTo} auth={authAdapter} appName={APP_NAME} />
);

const InviteRoute = () => (
  <InvitePage
    session={session}
    returnTo={returnTo}
    auth={authAdapter}
    activeOrgKey={ACTIVE_ORG_KEY}
  />
);

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
  const { t } = useTranslation();
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
        const status = await api.setup.status();
        if (!mounted) {
          return;
        }

        setSetupComplete(status.setupComplete);
        if (!status.setupComplete) {
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
  }, [user?.preferredLanguage]);

  useEffect(() => {
    const emailHash = user && !user.avatarUrl ? user.emailHash : '';
    if (!emailHash) {
      return undefined;
    }
    const controller = new AbortController();
    api.gravatar.profile(emailHash, controller.signal).then(profile => {
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
    if (!user?.accessToken) {
      return undefined;
    }
    const url = `${window.location.origin}/api/notifications/events`;
    return subscribeTerminateStream({
      url,
      headers: () => session.headers('GET', url),
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
            <Route path="/organizations/discover" element={<DiscoveryRoute theme={theme} />} />
            <Route path="/login" element={<LoginRoute />} />
            <Route
              path="/auth/callback"
              element={<CallbackPage complete={session.complete} onDone={afterSignIn} />}
            />
            <Route
              path="/register"
              element={<RegisterPage session={session} returnTo={returnTo} auth={authAdapter} />}
            />
            <Route path="/invite/:token" element={<InviteRoute />} />
            <Route path="/profile" element={<ProfileRoute activeOrgUuid={activeOrganization} />} />
            <Route path="/admin" element={<Admin />} />
            <Route
              path="/org-console"
              element={<OrgConsoleRoute org={activeOrganization} admin={isGlobalAdmin(user)} />}
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
