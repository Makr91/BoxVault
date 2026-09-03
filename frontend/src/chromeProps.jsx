import PropTypes from 'prop-types';

import { createNotificationsClient } from './chrome';
import BoxVaultLight from './images/BoxVault.svg?react';
import BoxVaultDark from './images/BoxVaultDark.svg?react';
import authHeader from './services/auth-header';
import AuthService from './services/auth.service';
import UserService from './services/user.service';
import { userDisplayName } from './utils/displayName';
import { log } from './utils/Logger';
import {
  isPushEnabled,
  isPushSupported,
  setPushEnabled,
  subscribePush,
  unsubscribePush,
} from './utils/pushNotifications';
import version from './version.json';

export const APP_NAME = 'BoxVault';
export const APP_VERSION = version.version;
export const REPO_URL = 'https://github.com/Makr91/BoxVault';
export const POWERED_BY = {
  href: 'https://startcloud.com',
  logoSrc: 'https://startcloud.com/assets/images/logos/startcloud-logo40.png',
};

export const notificationsAdapter = createNotificationsClient({
  baseUrl: window.location.origin,
  headers: () => authHeader(),
});

export const pushAdapter = {
  isSupported: isPushSupported,
  isEnabled: isPushEnabled,
  setEnabled: setPushEnabled,
  subscribe: subscribePush,
  unsubscribe: unsubscribePush,
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
  const user = AuthService.getCurrentUser();
  const response = await fetch(`${window.location.origin}/api/organization/${name}`, {
    headers: user?.accessToken ? { 'x-access-token': user.accessToken } : {},
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

const rememberPreference = patch => {
  const stored = AuthService.getCurrentUser();
  if (stored) {
    localStorage.setItem('user', JSON.stringify({ ...stored, ...patch }));
  }
};

export const persistTheme = preference =>
  UserService.updatePreferences({ theme: preference })
    .then(() => rememberPreference({ preferredTheme: preference }))
    .catch(error => {
      log.app.error('Theme preference not saved', { error: error.message });
    });

export const persistLanguage = language =>
  UserService.updatePreferences({ language })
    .then(() => rememberPreference({ preferredLanguage: language }))
    .catch(error => {
      log.component.error('Language preference not saved', { error: error.message });
    });
