import PropTypes from 'prop-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { itemShape } from './itemShape';

const formatMemory = memoryMb => {
  const mb = Number(memoryMb);
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${mb} MB`;
};

const formatDiskEntry = entry => {
  if (typeof entry === 'string') {
    return entry;
  }
  if (!entry || typeof entry !== 'object') {
    return String(entry ?? '');
  }
  return [entry.name, entry.size, entry.controller].filter(Boolean).join(' · ');
};

const osRow = (item, rows) => {
  const label = item.os?.label || '';
  const iconUrl = item.os?.iconUrl || '';
  if (!label && !iconUrl) {
    return;
  }
  rows.push({
    key: 'os',
    content: (
      <>
        {iconUrl ? (
          <img src={iconUrl} alt="" className="rounded-circle me-2 avatar-lg v-align-middle" />
        ) : null}
        {label}
      </>
    ),
  });
};

const buildRows = (item, t) => {
  const metadata = item.metadata || {};
  const rows = [];
  osRow(item, rows);
  const desktopLabel =
    typeof metadata.desktop === 'boolean'
      ? t(metadata.desktop ? 'pages.facts.desktop' : 'pages.facts.server')
      : null;
  const typeValue = [metadata.vm_type, desktopLabel].filter(Boolean).join(' · ');
  if (typeValue) {
    rows.push({ key: 'type', content: typeValue });
  }
  if (metadata.username) {
    rows.push({ key: 'username', content: <code>{metadata.username}</code> });
  }
  if (metadata.password) {
    rows.push({ key: 'password', value: metadata.password });
  }
  if (metadata.communicator) {
    rows.push({ key: 'communicator', content: metadata.communicator });
  }
  if (metadata.cpus) {
    rows.push({ key: 'cpus', content: metadata.cpus });
  }
  if (metadata.memory_mb) {
    rows.push({ key: 'memory', content: formatMemory(metadata.memory_mb) });
  }
  const disks = [
    ...(Array.isArray(metadata.disks) ? metadata.disks : []),
    ...(Array.isArray(metadata.cdroms) ? metadata.cdroms : []),
  ].map(formatDiskEntry);
  if (disks.length > 0) {
    rows.push({ key: 'disks', content: disks.map(entry => <div key={entry}>{entry}</div>) });
  }
  if (Array.isArray(metadata.providers) && metadata.providers.length > 0) {
    rows.push({ key: 'providers', content: metadata.providers.join(', ') });
  }
  if (metadata.built) {
    rows.push({ key: 'built', content: metadata.built });
  }
  const driver = metadata.core_provisioner_version || metadata.driver_version;
  if (driver) {
    rows.push({ key: 'driver', content: driver });
  }
  return rows;
};

const PasswordRow = ({ password }) => {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <div className="row mb-1">
      <dt className="col-sm-4">{t('pages.facts.password')}</dt>
      <dd className="col-sm-8 mb-1">
        <code className="me-2">{show ? password : '••••••••'}</code>
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setShow(current => !current)}
        >
          {show ? t('pages.facts.hide') : t('pages.facts.show')}
        </button>
      </dd>
    </div>
  );
};

PasswordRow.propTypes = {
  password: PropTypes.string.isRequired,
};

const ItemFacts = ({ item }) => {
  const { t } = useTranslation();
  const rows = buildRows(item, t);
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="card h-100">
      <div className="card-header">
        <h5 className="mb-0">{t('pages.item.facts')}</h5>
      </div>
      <div className="card-body">
        <dl className="mb-0">
          {rows.map(row =>
            row.key === 'password' ? (
              <PasswordRow key="password" password={row.value} />
            ) : (
              <div className="row mb-1" key={row.key}>
                <dt className="col-sm-4">{t(`pages.facts.${row.key}`)}</dt>
                <dd className="col-sm-8 mb-1">{row.content}</dd>
              </div>
            )
          )}
        </dl>
      </div>
    </div>
  );
};

ItemFacts.propTypes = {
  item: itemShape.isRequired,
};

export default ItemFacts;
