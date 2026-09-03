import PropTypes from 'prop-types';
import { useState, useEffect, useCallback } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBook, FaBuilding, FaCircleInfo, FaGear } from 'react-icons/fa6';
import { Link, useLocation } from 'react-router-dom';

import { AppChrome, Avatar, userDisplayName, userSecondaryLine } from './chrome';
import {
  APP_NAME,
  APP_VERSION,
  BrandLogo,
  POWERED_BY,
  REPO_URL,
  buildTicketUrl,
  fetchHealth,
  fetchOrganization,
  getSupportedLanguages,
  hasNotificationsScope,
  isOidcSession,
  loadOrganizations,
  notificationsAdapter,
  persistLanguage,
  pushAdapter,
} from './chromeProps';
import { collections } from './collections';
import AuthService from './services/auth.service';
import FavoritesService from './services/favorites.service';
import { fetchTrustedIssuers, resolveIssuer } from './utils/authServer';
import { log } from './utils/Logger';

const resolveMemberships = user => (Array.isArray(user?.organizations) ? user.organizations : []);

const resolveDisplayName = (userClaims, user) => userClaims?.name || userDisplayName(user);

const AUTH_PATHS = ['/login', '/register', '/auth/', '/setup'];

const RESERVED_ROUTES = [
  'about',
  'organizations',
  'login',
  'auth',
  'register',
  'invite',
  'profile',
  'admin',
  'org-console',
  'setup',
];

const AppRows = ({ showAdminBoard, showOrgConsole }) => {
  const { t } = useTranslation();
  return (
    <>
      {showAdminBoard ? (
        <Dropdown.Item as={Link} to="/admin">
          <FaGear className="me-2" />
          {t('navbar.admin')}
        </Dropdown.Item>
      ) : null}
      {showOrgConsole ? (
        <Dropdown.Item as={Link} to="/org-console">
          <FaBuilding className="me-2" />
          {t('navbar.orgConsole')}
        </Dropdown.Item>
      ) : null}
      <Dropdown.Item as={Link} to="/about">
        <FaCircleInfo className="me-2" />
        {t('navbar.about')}
      </Dropdown.Item>
      <Dropdown.Item href="/docs">
        <FaBook className="me-2" />
        {t('navbar.docs')}
      </Dropdown.Item>
    </>
  );
};

AppRows.propTypes = {
  showAdminBoard: PropTypes.bool.isRequired,
  showOrgConsole: PropTypes.bool.isRequired,
};

const routeOrgLogo = name => fetchOrganization(name).then(organization => organization.logo);

const Shell = ({
  currentUser,
  gravatarUrl,
  showAdminBoard,
  showOrgConsole,
  theme,
  themePreference,
  toggleTheme,
  logOut,
  logOutLocal,
  activeOrganization,
  onOrganizationSwitch,
  sessionEnded = null,
  children,
}) => {
  const { t, i18n } = useTranslation();
  const { pathname, search } = useLocation();
  const [favoriteApps, setFavoriteApps] = useState([]);
  const [userClaims, setUserClaims] = useState(null);
  const [ticketConfig, setTicketConfig] = useState(null);
  const [authServerUrl, setAuthServerUrl] = useState('');
  const [trustedIssuers, setTrustedIssuers] = useState([]);
  const [activeOrgGravatar, setActiveOrgGravatar] = useState(null);
  const [activeOrgCode, setActiveOrgCode] = useState(null);

  const oidc = isOidcSession(currentUser);
  const memberships = resolveMemberships(currentUser);

  const changeLanguage = async lng => {
    if (currentUser) {
      persistLanguage(lng);
    }
    await i18n.changeLanguage(lng);
  };

  useEffect(() => {
    let mounted = true;

    const loadTrustedIssuers = async () => {
      try {
        const issuers = await fetchTrustedIssuers();
        if (mounted) {
          setTrustedIssuers(issuers);
        }
      } catch (error) {
        log.auth.error('Failed to load trusted issuers', {
          error: error.message,
        });
        if (mounted) {
          setTrustedIssuers([]);
        }
      }
    };

    loadTrustedIssuers();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadUserData = async () => {
      if (!isOidcSession(currentUser)) {
        setFavoriteApps([]);
        setUserClaims(null);
        return;
      }
      try {
        const response = await FavoritesService.getUserInfoClaims();
        if (mounted) {
          setUserClaims(response.data);
          setFavoriteApps(response.data?.favorite_apps || []);
        }
      } catch (error) {
        if (!error.name?.includes('Cancel') && !error.message?.includes('aborted')) {
          log.api.error('Error loading user claims', {
            error: error.message,
          });
        }
      }
    };

    loadUserData();

    return () => {
      mounted = false;
    };
  }, [currentUser]);

  const fetchTicketConfig = useCallback(async mounted => {
    try {
      const response = await fetch(`${window.location.origin}/api/config/ticket`);
      if (response.ok) {
        const data = await response.json();
        if (mounted && data?.ticket_system) {
          setTicketConfig(data.ticket_system);
        }
      }
    } catch (error) {
      log.api.error('Error fetching ticket config', { error: error.message });
    }
  }, []);

  const fetchOrgGravatar = useCallback(async (org, user, mounted) => {
    try {
      const response = await fetch(`${window.location.origin}/api/organization/${org}`, {
        headers: { 'x-access-token': user.accessToken },
      });
      if (!response.ok) {
        return;
      }

      const orgData = await response.json();

      if (mounted) {
        setActiveOrgCode(orgData.external_issuer ? orgData.org_code || null : null);
      }

      if (orgData.logo && mounted) {
        setActiveOrgGravatar(orgData.logo);
        return;
      }

      if (!orgData.emailHash || !mounted) {
        return;
      }

      const profile = await AuthService.getGravatarProfile(orgData.emailHash);
      if (profile?.avatar_url && mounted) {
        setActiveOrgGravatar(profile.avatar_url);
      }
    } catch (error) {
      log.api.error('Error fetching active org gravatar', {
        error: error.message,
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadConfigs = async () => {
      await fetchTicketConfig(mounted);

      if (trustedIssuers.length > 0 && isOidcSession(currentUser) && currentUser?.accessToken) {
        const issuerUrl = resolveIssuer(currentUser.accessToken, trustedIssuers);
        if (issuerUrl && mounted) {
          setAuthServerUrl(issuerUrl);
        }
      }

      if (activeOrganization && currentUser) {
        await fetchOrgGravatar(activeOrganization, currentUser, mounted);
      }
    };

    loadConfigs();

    return () => {
      mounted = false;
    };
  }, [currentUser, trustedIssuers, activeOrganization, fetchTicketConfig, fetchOrgGravatar]);

  const ticketUrl = buildTicketUrl({
    ticketConfig,
    activeOrgCode,
    userClaims,
    user: currentUser,
  });

  const displayName = resolveDisplayName(userClaims, currentUser);
  const email = userSecondaryLine({ ...currentUser, name: displayName });
  const issuerUrl = oidc ? authServerUrl : '';

  const renderAvatar = size => (
    <Avatar
      picture={gravatarUrl}
      size={size}
      fallback={<BrandLogo theme={theme} className="logo-xl flex-shrink-0" />}
    />
  );

  const organizations = memberships
    .map(membership => membership.name)
    .filter(Boolean)
    .map(name => ({
      uuid: name,
      name,
      logo: name === activeOrganization ? activeOrgGravatar || '' : '',
    }));

  const onAuthPage = AUTH_PATHS.some(path => pathname.startsWith(path));
  const returnTo = sessionEnded?.returnTo || (onAuthPage ? '' : `${pathname}${search}`);
  const signInTo = returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : '/login';

  return (
    <AppChrome
      brand={{
        name: APP_NAME,
        logo: <BrandLogo theme={theme} className="logo-cluster icon-with-margin-sm" />,
        to: '/',
      }}
      links={[
        { key: 'about', label: t('navbar.about'), to: '/about' },
        { key: 'docs', label: t('navbar.docs'), href: '/docs' },
      ]}
      LinkComponent={Link}
      reserved={RESERVED_ROUTES}
      collections={collections}
      theme={{ preference: themePreference, onToggle: toggleTheme }}
      language={{ languages: getSupportedLanguages(), onPick: changeLanguage }}
      user={currentUser || null}
      identity={
        currentUser
          ? {
              displayName,
              email,
              renderAvatar,
              oidc,
              issuerUrl,
              localProfile: { to: '/profile', LinkComponent: Link },
            }
          : null
      }
      orgs={{
        organizations,
        activeUuid: activeOrganization || '',
        onPick: onOrganizationSwitch,
        load: loadOrganizations,
        mark: <BrandLogo theme={theme} className="logo-md icon-with-margin" />,
        crumbMark: <BrandLogo theme={theme} className="logo-sm" />,
        logoFor: routeOrgLogo,
      }}
      menu={
        currentUser
          ? {
              appName: t('navbar.boxvault'),
              appRows: <AppRows showAdminBoard={showAdminBoard} showOrgConsole={showOrgConsole} />,
              favorites: favoriteApps,
              notifications: hasNotificationsScope(userClaims) ? notificationsAdapter : null,
              push: pushAdapter,
              viewAllUrl: authServerUrl ? `${authServerUrl}/notifications` : '',
              ticketUrl,
            }
          : null
      }
      session={{
        signInTo,
        ended: Boolean(sessionEnded),
        onSignOut: logOutLocal,
        onSignOutEverywhere: logOut,
      }}
      footer={{ version: APP_VERSION, repoUrl: REPO_URL, poweredBy: POWERED_BY, fetchHealth }}
    >
      {children}
    </AppChrome>
  );
};

Shell.propTypes = {
  currentUser: PropTypes.shape({
    username: PropTypes.string,
    name: PropTypes.string,
    provider: PropTypes.string,
    accessToken: PropTypes.string,
    email: PropTypes.string,
    organization: PropTypes.string,
    organizations: PropTypes.arrayOf(PropTypes.object),
  }),
  gravatarUrl: PropTypes.string,
  showAdminBoard: PropTypes.bool,
  showOrgConsole: PropTypes.bool,
  theme: PropTypes.string.isRequired,
  themePreference: PropTypes.string.isRequired,
  toggleTheme: PropTypes.func.isRequired,
  logOut: PropTypes.func.isRequired,
  logOutLocal: PropTypes.func.isRequired,
  activeOrganization: PropTypes.string,
  onOrganizationSwitch: PropTypes.func.isRequired,
  sessionEnded: PropTypes.shape({ returnTo: PropTypes.string.isRequired }),
  children: PropTypes.node.isRequired,
};

export default Shell;
