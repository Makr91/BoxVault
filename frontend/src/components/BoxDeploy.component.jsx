import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaRocket } from 'react-icons/fa6';

import { itemShape, sortVersionsNewestFirst } from '../pages';
import { log } from '../utils/Logger';

let urlPromise = null;

/**
 * The configured Hyperweaver origin, fetched once per page load and shared by
 * every Deploy control; an empty string when Hyperweaver is not configured.
 * @returns {Promise<string>} The origin without a trailing slash
 */
export const fetchHyperweaverUrl = () => {
  urlPromise ||= fetch(`${window.location.origin}/api/config/hyperweaver`)
    .then(response => (response.ok ? response.json() : null))
    .then(data => (data?.hyperweaver?.url?.value || '').replace(/\/+$/, ''))
    .catch(error => {
      log.api.error('Error fetching hyperweaver config', { error: error.message });
      return '';
    });
  return urlPromise;
};

export const useHyperweaverUrl = () => {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let mounted = true;
    fetchHyperweaverUrl().then(value => {
      if (mounted) {
        setUrl(value);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);
  return url;
};

export const hasHyperweaverEntitlement = user =>
  Array.isArray(user?.entitlements) &&
  user.entitlements.some(
    entitlement =>
      typeof entitlement.value === 'string' && entitlement.value.startsWith('hyperweaver')
  );

/**
 * The version Deploy picks when the viewer has not chosen one: the newest
 * version that is not deprecated, else the newest.
 * @param {Array<Object>} versions - The item's versions
 * @returns {string} The version number, or an empty string without versions
 */
export const deployableVersion = versions => {
  const sorted = sortVersionsNewestFirst(versions || []);
  const active = sorted.find(version => !version.deprecated);
  return (active || sorted[0])?.version || '';
};

const deployHref = ({ hyperweaverUrl, org, name, version }) =>
  `${hyperweaverUrl}/?create=machine&box=${encodeURIComponent(`${org}/${name}`)}&box_version=${encodeURIComponent(version)}&box_arch=amd64&box_url=${encodeURIComponent(window.location.origin)}`;

const useDeploy = ({ user, org, name, version }) => {
  const { t } = useTranslation();
  const hyperweaverUrl = useHyperweaverUrl();
  if (!user || !hyperweaverUrl || !version || !hasHyperweaverEntitlement(user)) {
    return null;
  }
  return {
    href: deployHref({ hyperweaverUrl, org, name, version }),
    title: t('box.hyperweaver.deployVersionTitle', { version }),
  };
};

const deployProps = {
  user: PropTypes.object,
  org: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  version: PropTypes.string.isRequired,
};

export const DeployButton = ({ user, org, name, version, size = '' }) => {
  const { t } = useTranslation();
  const deploy = useDeploy({ user, org, name, version });
  if (!deploy) {
    return null;
  }
  return (
    <a
      className={`btn btn-primary ${size} fw-semibold d-inline-flex align-items-center gap-2 me-2`}
      href={deploy.href}
      target="_blank"
      rel="noopener noreferrer"
      title={deploy.title}
    >
      <FaRocket />
      {t('box.hyperweaver.deploy')}
    </a>
  );
};

DeployButton.propTypes = { ...deployProps, size: PropTypes.string };

export const DeployGlyph = ({ user, org, name, version }) => {
  const deploy = useDeploy({ user, org, name, version });
  if (!deploy) {
    return null;
  }
  return (
    <a
      className="text-primary"
      href={deploy.href}
      target="_blank"
      rel="noopener noreferrer"
      title={deploy.title}
      aria-label={deploy.title}
    >
      <FaRocket />
    </a>
  );
};

DeployGlyph.propTypes = deployProps;

export const BoxQuickActions = ({ item, ctx }) => (
  <DeployGlyph
    user={ctx.user}
    org={item.organization.name}
    name={item.name}
    version={deployableVersion(item.versions)}
  />
);

BoxQuickActions.propTypes = {
  item: itemShape.isRequired,
  ctx: PropTypes.shape({ user: PropTypes.object }).isRequired,
};
