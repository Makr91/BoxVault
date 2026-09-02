import PropTypes from 'prop-types';
import { useState, useEffect, useCallback } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBook, FaBuilding, FaCircleInfo, FaGear } from 'react-icons/fa6';
import { Link } from 'react-router-dom';

import { Header } from '../chrome';
import {
  BrandLogo,
  buildTicketUrl,
  hasNotificationsScope,
  isOidcSession,
  loadOrganizations,
  notificationsAdapter,
  persistLanguage,
  pushAdapter,
} from '../chromeProps';
import { getSupportedLanguages } from '../i18n';
import AuthService from '../services/auth.service';
import FavoritesService from '../services/favorites.service';
import { fetchTrustedIssuers, resolveIssuer } from '../utils/authServer';
import { userDisplayName, userSecondaryLine } from '../utils/displayName';
import { log } from '../utils/Logger';

const resolveMemberships = user => (Array.isArray(user?.organizations) ? user.organizations : []);

const resolveDisplayName = (userClaims, user) => userClaims?.name || userDisplayName(user);

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

const Navbar = ({
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
}) => {
  const { t, i18n } = useTranslation();
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

  const renderAvatar = size =>
    gravatarUrl ? (
      <img
        src={gravatarUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-circle flex-shrink-0"
      />
    ) : (
      <BrandLogo theme={theme} className="logo-xl flex-shrink-0" />
    );

  const organizations = memberships
    .map(membership => membership.name)
    .filter(Boolean)
    .map(name => ({
      uuid: name,
      name,
      logo: name === activeOrganization ? activeOrgGravatar || '' : '',
    }));

  const orgCrumbIcon = activeOrgGravatar ? (
    <img src={activeOrgGravatar} alt="" className="rounded-circle avatar-sm" />
  ) : (
    <BrandLogo theme={theme} className="logo-sm" />
  );

  const crumbs =
    currentUser && activeOrganization
      ? [
          {
            key: 'org',
            icon: orgCrumbIcon,
            label: activeOrganization,
            to: `/${activeOrganization}`,
          },
        ]
      : [];

  const userMenu = currentUser
    ? {
        displayName,
        email,
        renderAvatar,
        oidc,
        issuerUrl,
        localProfile: { to: '/profile', LinkComponent: Link },
        organizations,
        activeOrgUuid: activeOrganization || '',
        onPickOrg: onOrganizationSwitch,
        loadOrganizations,
        orgMark: <BrandLogo theme={theme} className="logo-md icon-with-margin" />,
        favorites: favoriteApps,
        appName: t('navbar.boxvault'),
        appRows: <AppRows showAdminBoard={showAdminBoard} showOrgConsole={showOrgConsole} />,
        notifications: hasNotificationsScope(userClaims) ? notificationsAdapter : null,
        push: pushAdapter,
        viewAllUrl: authServerUrl ? `${authServerUrl}/notifications` : '',
        ticketUrl,
        onSignOut: logOutLocal,
        onSignOutEverywhere: logOut,
      }
    : null;

  return (
    <Header
      brand={{
        name: 'BoxVault',
        logo: <BrandLogo theme={theme} className="logo-cluster icon-with-margin-sm" />,
        to: '/',
      }}
      links={[
        { key: 'about', label: t('navbar.about'), to: '/about' },
        { key: 'docs', label: t('navbar.docs'), href: '/docs' },
      ]}
      crumbs={crumbs}
      LinkComponent={Link}
      theme={{ preference: themePreference, onToggle: toggleTheme }}
      language={{ languages: getSupportedLanguages(), onPick: changeLanguage }}
      signedIn={Boolean(currentUser)}
      signInTo="/login"
      userMenu={userMenu}
    />
  );
};

Navbar.propTypes = {
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
  onOrganizationSwitch: PropTypes.func,
};

export default Navbar;
