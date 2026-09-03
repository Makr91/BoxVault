import { Link } from 'react-router-dom';

import { OrgLogo, formatRelativeTime, itemPath } from '../chrome';

import { architectureNames, latestReleaseTime, providerNames } from './itemShape';

const localeDate = value => (value ? new Date(value).toLocaleDateString() : '');

const namesKey = names => names.join(' ').toLowerCase();

const nameBadges = names =>
  names.length > 0 ? (
    <span className="d-inline-flex flex-wrap gap-1">
      {names.map(name => (
        <span key={name} className="badge bg-secondary badge-xs">
          {name}
        </span>
      ))}
    </span>
  ) : (
    'N/A'
  );

export const nameColumn = {
  key: 'name',
  labelKey: 'pages.table.name',
  sortValue: item => item.name.toLowerCase(),
  render: (item, ctx) => {
    const orgName = item.organization.name;
    const text = `${orgName}/${item.name}`;
    return (
      <>
        <OrgLogo
          org={item.organization}
          size={30}
          className="rounded-circle avatar-lg icon-with-margin-sm v-align-middle"
          fallback={ctx.orgMark}
        />
        {ctx.collection.itemRoute ? (
          <Link to={itemPath(ctx.collection, orgName, item.name)} className="v-align-middle">
            {text}
          </Link>
        ) : (
          <span className="v-align-middle">{text}</span>
        )}
      </>
    );
  },
};

export const labelColumn = {
  key: 'label',
  labelKey: 'pages.table.name',
  sortValue: item => (item.label || item.name).toLowerCase(),
  render: (item, ctx) => (
    <>
      {item.icon ? (
        <img
          src={item.icon}
          alt=""
          className="rounded icon-with-margin-sm v-align-middle prov-icon-sm"
          loading="lazy"
          onError={event => {
            event.currentTarget.style.display = 'none';
          }}
        />
      ) : null}
      <Link
        to={itemPath(ctx.collection, item.organization.name, item.name)}
        className="v-align-middle"
      >
        {item.label || item.name}
      </Link>
      {item.label && item.label !== item.name ? (
        <code className="checksum ms-2">{item.name}</code>
      ) : null}
    </>
  ),
};

export const osColumn = {
  key: 'os',
  labelKey: 'pages.table.os',
  sortValue: item => (item.os?.label || '').toLowerCase(),
  render: item => {
    const label = item.os?.label || '';
    const iconUrl = item.os?.iconUrl || '';
    if (!label && !iconUrl) {
      return null;
    }
    return (
      <>
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            className="rounded-circle icon-with-margin-sm v-align-middle avatar-lg"
          />
        ) : null}
        <span className="v-align-middle">{label}</span>
      </>
    );
  },
};

export const statusColumn = {
  key: 'status',
  labelKey: 'pages.table.status',
  sortValue: item => (item.published ? 0 : 1),
  render: (item, ctx) => (
    <span className={`badge ${item.published ? 'bg-success' : 'bg-warning'}`}>
      {ctx.t(item.published ? 'pages.status.published' : 'pages.status.pending')}
    </span>
  ),
};

export const visibilityColumn = {
  key: 'visibility',
  labelKey: 'pages.table.visibility',
  sortValue: item => (item.isPublic ? 0 : 1),
  render: (item, ctx) => (
    <span className={`badge ${item.isPublic ? 'bg-info' : 'bg-secondary'}`}>
      {ctx.t(item.isPublic ? 'pages.status.public' : 'pages.status.private')}
    </span>
  ),
};

export const createdColumn = {
  key: 'created',
  labelKey: 'pages.table.created',
  defaultHidden: true,
  sortValue: item => new Date(item.createdAt || 0).getTime(),
  render: item => localeDate(item.createdAt),
};

export const updatedColumn = {
  key: 'updated',
  labelKey: 'pages.table.updated',
  defaultHidden: true,
  sortValue: item => new Date(item.updatedAt || 0).getTime(),
  render: item => localeDate(item.updatedAt),
};

export const releasedColumn = {
  key: 'released',
  labelKey: 'pages.table.released',
  sortValue: item => latestReleaseTime(item) || 0,
  render: (item, ctx) => {
    const time = latestReleaseTime(item);
    return time ? formatRelativeTime(time, ctx.language) : '';
  },
};

export const downloadsColumn = {
  key: 'downloads',
  labelKey: 'pages.table.downloads',
  sortValue: item => item.downloads || 0,
  render: item => item.downloads || 0,
};

export const versionsColumn = {
  key: 'versions',
  labelKey: 'pages.table.versions',
  sortValue: item => (item.versions || []).length,
  render: item => (item.versions || []).length,
};

export const providersColumn = {
  key: 'providers',
  labelKey: 'pages.table.providers',
  sortValue: item => namesKey(providerNames(item)),
  render: item => nameBadges(providerNames(item)),
};

export const architecturesColumn = {
  key: 'architectures',
  labelKey: 'pages.table.architectures',
  defaultHidden: true,
  sortValue: item => namesKey(architectureNames(item)),
  render: item => nameBadges(architectureNames(item)),
};

export const sizeColumn = {
  key: 'size',
  labelKey: 'pages.table.size',
  sortValue: item => item.artifact?.fileSize || 0,
  render: (item, ctx) => ctx.formatFileSize(item.artifact?.fileSize),
};

export const checksumColumn = {
  key: 'checksum',
  labelKey: 'pages.table.checksum',
  sortValue: item => (item.artifact?.checksum || '').toLowerCase(),
  render: item => {
    const checksum = item.artifact?.checksum || '';
    return checksum ? <code title={checksum}>{checksum}</code> : '';
  },
};
