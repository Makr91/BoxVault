import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import ErrorBoundary from './ErrorBoundary';
import Footer from './Footer';
import Header, { brandShape, linkShape } from './Header';
import { localProfileShape } from './IdentityCard';
import { reportRenderError } from './logger';
import { NoticeToasts, useNotify } from './notices';
import { notificationsAdapterShape, pushAdapterShape } from './NotificationsModal';
import { OrgLogo, organizationShape } from './OrgSwitcherModal';
import { buildRouteCrumbs, parseRoute } from './routeCrumbs';

const useRouteOrgLogo = (routeOrg, signedIn, logoFor) => {
  const [resolved, setResolved] = useState({ name: '', logo: '' });
  const logoForRef = useRef(logoFor);

  useEffect(() => {
    logoForRef.current = logoFor;
  });

  useEffect(() => {
    if (!routeOrg || !signedIn || !logoForRef.current) {
      return undefined;
    }
    let mounted = true;
    Promise.resolve(logoForRef.current(routeOrg))
      .then(logo => {
        if (mounted) {
          setResolved({ name: routeOrg, logo: logo || '' });
        }
      })
      .catch(() => null);
    return () => {
      mounted = false;
    };
  }, [routeOrg, signedIn]);

  return resolved.name === routeOrg ? resolved.logo : '';
};

const useRouteCrumbs = ({ pathname, reserved, collections, signedIn, orgs, t }) => {
  const route = parseRoute(pathname, { reserved, collections });
  const routeOrg = route?.org || '';
  const memberLogo = orgs.organizations.find(entry => entry.name === routeOrg)?.logo || '';
  const fetchedLogo = useRouteOrgLogo(memberLogo ? '' : routeOrg, signedIn, orgs.logoFor);
  const orgIcon = (
    <OrgLogo
      org={{ logo: memberLogo || fetchedLogo }}
      size={16}
      className="rounded-circle avatar-sm"
      fallback={orgs.crumbMark || null}
    />
  );
  return signedIn ? buildRouteCrumbs({ route, t, orgIcon }) : [];
};

const SESSION_ENDED_KEY = 'session-ended';

const useSessionEndedBanner = ended => {
  const { t } = useTranslation();
  const notify = useNotify();

  useEffect(() => {
    if (!ended) {
      notify('warning', '', { key: SESSION_ENDED_KEY });
      return;
    }
    const text = (
      <>
        <strong>{t('sessionEnded.title')}</strong> {t('sessionEnded.body')}
      </>
    );
    notify('warning', text, { tier: 'banner', key: SESSION_ENDED_KEY });
  }, [ended, notify, t]);
};

/**
 * The whole chrome around an estate app's routes: the header with the
 * route crumbs, the user menu and the notice banners, the notice toasts,
 * the one scroll region with the page inside its own error boundary so a
 * page that throws keeps the chrome, and the footer. Everything an app
 * differs in arrives as data; the app renders its routes as children.
 */
const AppChrome = ({
  brand,
  links = [],
  LinkComponent = 'a',
  reserved,
  collections,
  theme,
  language,
  user = null,
  identity = null,
  orgs,
  menu = null,
  session,
  footer,
  children,
}) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const scrollRef = useRef(null);
  const signedIn = Boolean(user);
  const crumbs = useRouteCrumbs({ pathname, reserved, collections, signedIn, orgs, t });
  useSessionEndedBanner(Boolean(session.ended) && !signedIn);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [pathname]);

  const userMenu =
    signedIn && identity && menu
      ? {
          ...identity,
          localProfile: identity.localProfile || null,
          organizations: orgs.organizations,
          activeOrgUuid: orgs.activeUuid,
          onPickOrg: orgs.onPick,
          loadOrganizations: orgs.load || null,
          orgMark: orgs.mark || null,
          ...menu,
          appRows: menu.appRows || null,
          notifications: menu.notifications || null,
          onSignOut: session.onSignOut,
          onSignOutEverywhere: session.onSignOutEverywhere,
        }
      : null;

  return (
    <div className="App d-flex flex-column vh-100">
      <Header
        brand={brand}
        links={links}
        crumbs={crumbs}
        LinkComponent={LinkComponent}
        theme={theme}
        language={language}
        signedIn={signedIn}
        onSignIn={session.onSignIn || null}
        signInTo={session.signInTo || ''}
        userMenu={userMenu}
      />
      <NoticeToasts LinkComponent={LinkComponent} />
      <div ref={scrollRef} className="container-fluid app-scroll py-3">
        <ErrorBoundary showErrorDetails={import.meta.env.DEV} onError={reportRenderError}>
          {children}
        </ErrorBoundary>
      </div>
      <Footer
        appName={brand.name}
        version={footer.version}
        repoUrl={footer.repoUrl}
        poweredBy={footer.poweredBy}
        fetchHealth={footer.fetchHealth || null}
      />
    </div>
  );
};

export const identityShape = PropTypes.shape({
  displayName: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  renderAvatar: PropTypes.func.isRequired,
  oidc: PropTypes.bool.isRequired,
  issuerUrl: PropTypes.string.isRequired,
  localProfile: localProfileShape,
});

export const orgsShape = PropTypes.shape({
  organizations: PropTypes.arrayOf(organizationShape).isRequired,
  activeUuid: PropTypes.string.isRequired,
  onPick: PropTypes.func.isRequired,
  load: PropTypes.func,
  mark: PropTypes.node,
  crumbMark: PropTypes.node,
  logoFor: PropTypes.func,
});

export const menuShape = PropTypes.shape({
  appName: PropTypes.string.isRequired,
  appRows: PropTypes.node,
  favorites: PropTypes.array.isRequired,
  notifications: notificationsAdapterShape,
  push: pushAdapterShape.isRequired,
  viewAllUrl: PropTypes.string.isRequired,
  ticketUrl: PropTypes.string.isRequired,
});

export const sessionShape = PropTypes.shape({
  onSignIn: PropTypes.func,
  signInTo: PropTypes.string,
  ended: PropTypes.bool,
  onSignOut: PropTypes.func.isRequired,
  onSignOutEverywhere: PropTypes.func.isRequired,
});

export const footerShape = PropTypes.shape({
  version: PropTypes.string.isRequired,
  repoUrl: PropTypes.string.isRequired,
  poweredBy: PropTypes.shape({
    href: PropTypes.string.isRequired,
    logoSrc: PropTypes.string.isRequired,
  }).isRequired,
  fetchHealth: PropTypes.func,
});

AppChrome.propTypes = {
  brand: brandShape.isRequired,
  links: PropTypes.arrayOf(linkShape),
  LinkComponent: PropTypes.elementType,
  reserved: PropTypes.arrayOf(PropTypes.string).isRequired,
  collections: PropTypes.array.isRequired,
  theme: PropTypes.shape({
    preference: PropTypes.string.isRequired,
    onToggle: PropTypes.func.isRequired,
  }).isRequired,
  language: PropTypes.shape({
    languages: PropTypes.arrayOf(PropTypes.string).isRequired,
    onPick: PropTypes.func.isRequired,
  }).isRequired,
  user: PropTypes.object,
  identity: identityShape,
  orgs: orgsShape.isRequired,
  menu: menuShape,
  session: sessionShape.isRequired,
  footer: footerShape.isRequired,
  children: PropTypes.node.isRequired,
};

export default AppChrome;
