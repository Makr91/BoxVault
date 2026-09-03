import PropTypes from 'prop-types';
import { useState, useEffect } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBook, FaBuilding, FaCircleInfo, FaGear } from 'react-icons/fa6';
import { Link, useLocation } from 'react-router-dom';

import { AppChrome, Avatar, log, userDisplayName, userSecondaryLine } from './chrome';
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
  loadOrganizations,
  notificationsAdapter,
  pushAdapter,
  returnTo,
} from './chromeProps';
import { collections } from './collections';
import { sessionStateShape } from './session';

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
  account,
  gravatarUrl,
  showAdminBoard,
  showOrgConsole,
  theme,
  themePreference,
  toggleTheme,
  onSignOut,
  children,
}) => {
  const { t, i18n } = useTranslation();
  const { pathname, search } = useLocation();
  const { user, claims, organizations: memberships, activeOrgUuid, issuerUrl, oidc } = account;
  const [ticketConfig, setTicketConfig] = useState(null);
  const [activeOrg, setActiveOrg] = useState(null);

  const changeLanguage = async lng => {
    account.savePreferences({ language: lng });
    await i18n.changeLanguage(lng);
  };

  useEffect(() => {
    let mounted = true;

    const loadTicketConfig = async () => {
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
    };

    loadTicketConfig();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user || !activeOrgUuid) {
      return undefined;
    }
    let mounted = true;

    fetchOrganization(activeOrgUuid)
      .then(organization => {
        if (mounted) {
          setActiveOrg(organization);
        }
      })
      .catch(error => {
        log.api.error('Error fetching active organization', { error: error.message });
      });

    return () => {
      mounted = false;
    };
  }, [user, activeOrgUuid]);

  const active = activeOrg?.name === activeOrgUuid ? activeOrg : null;

  const ticketUrl = buildTicketUrl({
    ticketConfig,
    activeOrgCode: active?.orgCode || '',
    userClaims: claims,
    user,
  });

  const displayName = claims?.name || userDisplayName(user);
  const email = userSecondaryLine({ ...user, name: displayName });

  const renderAvatar = size => (
    <Avatar
      picture={gravatarUrl}
      size={size}
      fallback={<BrandLogo theme={theme} className="logo-xl flex-shrink-0" />}
    />
  );

  const organizations = memberships.map(org => ({
    ...org,
    logo: org.name === activeOrgUuid ? active?.logo || '' : '',
  }));

  const onAuthPage = returnTo.onAuthPage(pathname);
  const returnPath = account.sessionEnded?.returnTo || (onAuthPage ? '' : `${pathname}${search}`);

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
      user={user}
      identity={
        user
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
        activeUuid: activeOrgUuid,
        onPick: account.pickOrg,
        load: loadOrganizations,
        mark: <BrandLogo theme={theme} className="logo-md icon-with-margin" />,
        crumbMark: <BrandLogo theme={theme} className="logo-sm" />,
        logoFor: routeOrgLogo,
      }}
      menu={
        user
          ? {
              appName: t('navbar.boxvault'),
              appRows: <AppRows showAdminBoard={showAdminBoard} showOrgConsole={showOrgConsole} />,
              favorites: claims?.favorite_apps || [],
              notifications: hasNotificationsScope(claims) ? notificationsAdapter : null,
              push: pushAdapter,
              viewAllUrl: issuerUrl ? `${issuerUrl}/notifications` : '',
              ticketUrl,
            }
          : null
      }
      session={{
        signInTo: returnTo.signInTo(returnPath),
        ended: Boolean(account.sessionEnded),
        onSignOut,
        onSignOutEverywhere: account.signOutEverywhere,
      }}
      footer={{ version: APP_VERSION, repoUrl: REPO_URL, poweredBy: POWERED_BY, fetchHealth }}
    >
      {children}
    </AppChrome>
  );
};

Shell.propTypes = {
  account: sessionStateShape.isRequired,
  gravatarUrl: PropTypes.string.isRequired,
  showAdminBoard: PropTypes.bool.isRequired,
  showOrgConsole: PropTypes.bool.isRequired,
  theme: PropTypes.string.isRequired,
  themePreference: PropTypes.string.isRequired,
  toggleTheme: PropTypes.func.isRequired,
  onSignOut: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export default Shell;
