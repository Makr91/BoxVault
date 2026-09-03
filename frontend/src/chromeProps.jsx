import PropTypes from 'prop-types';

import { createI18n, createNotificationsClient, createPush, log, userDisplayName } from './chrome';
import BoxVaultLight from './images/BoxVault.svg?react';
import BoxVaultDark from './images/BoxVaultDark.svg?react';
import authHeader from './services/auth-header';
import AuthService from './services/auth.service';
import NotificationsService from './services/notifications.service';
import UserService from './services/user.service';
import { createBackendSession, createReturnTo, createSessionEvents } from './session';
import version from './version.json';

export const APP_NAME = 'BoxVault';
export const APP_VERSION = version.version;
export const REPO_URL = 'https://github.com/Makr91/BoxVault';
export const POWERED_BY = {
  href: 'https://startcloud.com',
  logoSrc: 'https://startcloud.com/assets/images/logos/startcloud-logo40.png',
};
export const ACTIVE_ORG_KEY = 'activeOrganization';

const loadSupportedLanguages = async () => {
  try {
    const response = await fetch('/api/health');
    if (response.ok) {
      const data = await response.json();
      if (data.supported_languages) {
        log.app.info('Frontend using backend-detected locales: ', data.supported_languages);
        return data.supported_languages;
      }
    }
  } catch (error) {
    log.app.error('Failed to fetch supported languages', { error });
  }
  return ['en', 'es'];
};

export const {
  i18n,
  ready: i18nPromise,
  getSupportedLanguages,
} = createI18n({ loadSupportedLanguages, debug: true });

export const events = createSessionEvents();

export const returnTo = createReturnTo({
  storageKey: 'boxvault_intended_url',
  signInPath: '/login',
  authPaths: ['/login', '/register', '/auth/', '/setup'],
});

export const session = createBackendSession({ baseUrl: window.location.origin, events });

export const notificationsAdapter = createNotificationsClient({
  baseUrl: window.location.origin,
  headers: () => authHeader(),
});

const getVapidKey = async () => {
  const response = await fetch(`${window.location.origin}/api/notifications/vapid-key`);
  if (!response.ok) {
    throw new Error(`VAPID key request failed with status ${response.status}`);
  }
  const data = await response.json();
  return data.publicKey;
};

export const push = createPush({
  storageKey: 'boxvault_push_enabled',
  serviceWorkerUrl: `/notification-sw.js?app=${encodeURIComponent(APP_NAME)}`,
  getVapidKey,
  createSubscription: subscription => NotificationsService.createSubscription(subscription),
  deleteSubscription: endpoint => NotificationsService.deleteSubscription(endpoint),
});

export const pushAdapter = {
  isSupported: push.isPushSupported,
  isEnabled: push.isPushEnabled,
  setEnabled: push.setPushEnabled,
  subscribe: push.subscribePush,
  unsubscribe: push.unsubscribePush,
};

export const fetchHealth = async () => {
  const response = await fetch('/api/health');
  if (!response.ok) {
    throw new Error('Health check failed');
  }
  return response.json();
};

export const BrandLogo = ({ theme, className }) =>
  theme === 'light' ? (
    <BoxVaultLight className={className} />
  ) : (
    <BoxVaultDark className={className} />
  );

BrandLogo.propTypes = {
  theme: PropTypes.string.isRequired,
  className: PropTypes.string.isRequired,
};

export const isOidcSession = user => !!user?.provider?.startsWith('oidc-');

export const hasNotificationsScope = claims =>
  []
    .concat(claims?.scope || [])
    .join(' ')
    .split(/\s+/)
    .includes('notifications');

const knobValue = (config, key) => config?.[key]?.value || '';

const firstValue = (...values) => values.find(value => !!value) || '';

export const buildTicketUrl = ({ ticketConfig, activeOrgCode, userClaims, user }) => {
  if (!knobValue(ticketConfig, 'enabled')) {
    return '';
  }

  const claims = userClaims || {};
  const params = new URLSearchParams({
    req: firstValue(knobValue(ticketConfig, 'req_type'), 'sso'),
    customerId: firstValue(
      activeOrgCode,
      claims.customer_id,
      knobValue(ticketConfig, 'fallback_customer_id')
    ),
    user: firstValue(claims.name, userDisplayName(user)),
    email: firstValue(claims.email, user?.email),
    context: knobValue(ticketConfig, 'context'),
  });

  return `${knobValue(ticketConfig, 'base_url')}&${params.toString()}`;
};

export const organizationLogo = async org => {
  const logo = org.logo || org.organization?.logo;
  if (logo) {
    return logo;
  }
  const emailHash = org.emailHash || org.organization?.emailHash;
  if (!emailHash) {
    return '';
  }
  try {
    const profile = await AuthService.getGravatarProfile(emailHash);
    return profile?.avatar_url || '';
  } catch (error) {
    log.api.error('Error fetching org gravatar', { error: error.message });
    return '';
  }
};

export const fetchOrganization = async name => {
  const response = await fetch(`${window.location.origin}/api/organization/${name}`, {
    headers: session.authHeader(),
  });
  if (!response.ok) {
    throw new Error(`organization ${name} answered ${response.status}`);
  }
  const data = await response.json();
  return {
    name,
    displayName: data.display_name || '',
    logo: await organizationLogo(data),
    description: data.description || '',
    orgCode: data.external_issuer ? data.org_code || '' : '',
  };
};

export const loadOrganizations = async () => {
  const response = await UserService.getUserOrganizations();
  const rows = response.data || [];
  return Promise.all(
    rows.map(async org => {
      const name = org.name || org.organization?.name;
      return {
        uuid: name,
        name,
        description: org.description || org.organization?.description || '',
        roles: org.role ? [String(org.role).toUpperCase()] : [],
        primary: Boolean(org.isPrimary),
        personal: Boolean(org.personal),
        logo: await organizationLogo(org),
      };
    })
  );
};
