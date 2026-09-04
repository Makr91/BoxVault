import PropTypes from 'prop-types';

import {
  createApiClient,
  createI18n,
  createNotificationsClient,
  createPush,
  log,
  userDisplayName,
} from './chrome';
import BoxVaultLight from './images/BoxVault.svg?react';
import BoxVaultDark from './images/BoxVaultDark.svg?react';
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
export const LOGIN_METHOD_KEY = 'boxvault_login_method';
export const SILENT_SSO_KEY = 'boxvault_silent_sso_attempted';
export const JOIN_INTENT_KEY = 'boxvault_join_org';

export const events = createSessionEvents();

export const returnTo = createReturnTo({
  storageKey: 'boxvault_intended_url',
  signInPath: '/login',
  authPaths: ['/login', '/register', '/auth/', '/setup'],
});

export const session = createBackendSession({ baseUrl: window.location.origin, events });

export const client = createApiClient({
  baseUrl: window.location.origin,
  session,
  onError: error =>
    log.api.error('Request failed', {
      method: error.request.method,
      url: error.request.url,
      status: error.status,
      message: error.message,
    }),
});

const PUBLIC = { auth: false };
const SUBSCRIPTIONS_PATH = '/api/notifications/subscriptions';

export const fetchHealth = () => client.get('/api/health', PUBLIC);

const loadSupportedLanguages = async () => {
  try {
    const data = await fetchHealth();
    if (data.supported_languages) {
      log.app.info('Frontend using backend-detected locales: ', data.supported_languages);
      return data.supported_languages;
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
} = createI18n({ loadSupportedLanguages });

export const notificationsAdapter = {
  ...createNotificationsClient({ client }),
  sendTest: () => client.post('/api/notifications/test/channel', {}),
};

export const push = createPush({
  storageKey: 'boxvault_push_enabled',
  serviceWorkerUrl: `/notification-sw.js?app=${encodeURIComponent(APP_NAME)}`,
  getVapidKey: () =>
    client.get('/api/notifications/vapid-key', PUBLIC).then(data => data.publicKey),
  createSubscription: subscription => client.post(SUBSCRIPTIONS_PATH, subscription),
  deleteSubscription: endpoint => client.delete(SUBSCRIPTIONS_PATH, { body: { endpoint } }),
});

export const pushAdapter = {
  isSupported: push.isPushSupported,
  isEnabled: push.isPushEnabled,
  setEnabled: push.setPushEnabled,
  subscribe: push.subscribePush,
  unsubscribe: push.unsubscribePush,
  sendTest: () => client.post('/api/notifications/test/toast', {}),
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
