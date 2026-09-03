import PropTypes from 'prop-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { organizationShape, useNotify } from '../chrome';

import { currentPath } from './returnTo';

const EMPTY = { user: null, organizations: [], oidc: false, issuerUrl: '' };

const resolveActiveOrg = (organizations, stored) => {
  if (stored && organizations.some(org => org.uuid === stored)) {
    return stored;
  }
  return (organizations.find(org => org.primary) || organizations[0])?.uuid || '';
};

export const sessionStateShape = PropTypes.shape({
  user: PropTypes.object,
  claims: PropTypes.object,
  organizations: PropTypes.arrayOf(organizationShape).isRequired,
  oidc: PropTypes.bool.isRequired,
  issuerUrl: PropTypes.string.isRequired,
  activeOrgUuid: PropTypes.string.isRequired,
  pickOrg: PropTypes.func.isRequired,
  sessionEnded: PropTypes.shape({ returnTo: PropTypes.string.isRequired }),
  signIn: PropTypes.func.isRequired,
  signOut: PropTypes.func.isRequired,
  signOutEverywhere: PropTypes.func.isRequired,
  refresh: PropTypes.func.isRequired,
  reload: PropTypes.func.isRequired,
  savePreferences: PropTypes.func.isRequired,
});

/**
 * The session state every estate app renders through: the provider's
 * stored session on the first render and its loaded one after, its
 * claims, the memberships in the chrome's organization shape, the active
 * organization resolved stored → primary → first and persisted under the
 * app's key, the ended state with the page to return to, the sign-in and
 * sign-out handlers, and the push subscription kept in sync while signed
 * in.
 *
 * @param {Object} options - The app's side
 * @param {Object} options.provider - A session provider such as `createBrowserOidc` or `createBackendSession`
 * @param {Object} options.events - The bus from `createSessionEvents`
 * @param {Object} options.returnTo - The helper from `createReturnTo`
 * @param {string} options.activeOrgKey - localStorage key of the active organization
 * @param {Object} [options.push] - The functions from `createPush`
 * @param {Function} [options.onAdopt] - Called with the session, or null, before it is rendered
 * @returns {Object} The session state and handlers
 */
export const useSession = ({
  provider,
  events,
  returnTo,
  activeOrgKey,
  push = null,
  onAdopt = null,
}) => {
  const { t } = useTranslation();
  const notify = useNotify();
  const onAdoptRef = useRef(onAdopt);
  const [session, setSession] = useState(() => {
    const restored = provider.restore();
    if (onAdopt) {
      onAdopt(restored);
    }
    return restored || EMPTY;
  });
  const [claims, setClaims] = useState(null);
  const [activeOrgUuid, setActiveOrgUuid] = useState(() =>
    resolveActiveOrg(session.organizations, localStorage.getItem(activeOrgKey))
  );
  const [ended, setEnded] = useState(null);

  useEffect(() => {
    onAdoptRef.current = onAdopt;
  });

  const persistActiveOrg = useCallback(
    uuid => {
      if (uuid) {
        localStorage.setItem(activeOrgKey, uuid);
      } else {
        localStorage.removeItem(activeOrgKey);
      }
    },
    [activeOrgKey]
  );

  const adopt = useCallback(
    next => {
      const current = next || EMPTY;
      if (onAdoptRef.current) {
        onAdoptRef.current(next);
      }
      setSession(current);
      const resolved = resolveActiveOrg(current.organizations, localStorage.getItem(activeOrgKey));
      setActiveOrgUuid(resolved);
      persistActiveOrg(resolved);
      if (next) {
        setEnded(null);
        provider.claims().then(setClaims);
      } else {
        setClaims(null);
      }
    },
    [activeOrgKey, persistActiveOrg, provider]
  );

  useEffect(() => {
    const offEnded = events.on('sessionEnded', detail => {
      adopt(null);
      setEnded({ returnTo: detail?.returnTo || '/' });
    });
    const offLogin = events.on('login', () => provider.load().then(adopt));
    const offLogout = events.on('logout', () => {
      provider.signOut();
      adopt(null);
    });
    provider.load().then(adopt);
    return () => {
      offEnded();
      offLogin();
      offLogout();
    };
  }, [adopt, events, provider]);

  useEffect(() => {
    if (!session.user || !push || !push.isPushEnabled()) {
      return undefined;
    }
    const report = () => notify('danger', t('notifications.enableError'));
    push.syncSubscription().catch(report);
    return push.listenForSubscriptionChange(report);
  }, [notify, push, session.user, t]);

  const pickOrg = uuid => {
    if (!session.organizations.some(org => org.uuid === uuid)) {
      return;
    }
    setActiveOrgUuid(uuid);
    persistActiveOrg(uuid);
  };

  const signIn = () => {
    const onAuthPage = returnTo.onAuthPage(window.location.pathname);
    returnTo.remember(ended?.returnTo || (onAuthPage ? '' : currentPath()));
    setEnded(null);
    return provider.begin({});
  };

  const signOut = () => {
    provider.signOut();
    adopt(null);
  };

  const refresh = useCallback(() => provider.refresh().then(adopt), [adopt, provider]);

  const reload = useCallback(() => provider.reload().then(adopt), [adopt, provider]);

  return {
    ...session,
    claims,
    activeOrgUuid,
    pickOrg,
    sessionEnded: ended,
    signIn,
    signOut,
    signOutEverywhere: provider.signOutEverywhere,
    refresh,
    reload,
    savePreferences: provider.savePreferences,
  };
};
