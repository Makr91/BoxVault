import { log } from './chrome';
import { createDeployControls, deployableVersion } from './pages';
import { api } from './services/api';

export { deployableVersion };

const fetchHyperweaverUrl = () =>
  api.config
    .hyperweaver()
    .then(data => data?.hyperweaver?.url?.value || '')
    .catch(error => {
      log.api.error('Error fetching hyperweaver config', { error: error.message });
      return '';
    });

export const hasHyperweaverEntitlement = user =>
  Array.isArray(user?.entitlements) &&
  user.entitlements.some(
    entitlement =>
      typeof entitlement.value === 'string' && entitlement.value.startsWith('hyperweaver')
  );

const hrefFor = ({ hyperweaverUrl, item, version }) =>
  `${hyperweaverUrl}/?create=machine&box=${encodeURIComponent(`${item.organization.name}/${item.name}`)}&box_version=${encodeURIComponent(version)}&box_arch=amd64&box_url=${encodeURIComponent(window.location.origin)}`;

export const {
  DeployButton,
  DeployGlyph,
  ItemQuickActions: BoxQuickActions,
} = createDeployControls({
  fetchHyperweaverUrl,
  canDeploy: hasHyperweaverEntitlement,
  hrefFor,
});
