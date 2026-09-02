import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-markdown';
import { Link } from 'react-router-dom';

import { providerPath } from '../chrome';

import DeprecationBanner from './DeprecationBanner';
import { collectionShape, pageContextShape, versionShape } from './itemShape';
import PageHeader from './PageHeader';
import StatusChips from './StatusChips';
import { useNotice } from './useNotice';

const localeDate = value => (value ? new Date(value).toLocaleDateString() : '');

const ArtifactsTable = ({ artifacts }) => {
  const { t } = useTranslation();
  return (
    <>
      <h4>{t('pages.version.artifacts')}</h4>
      <Table striped className="table">
        <thead>
          <tr>
            <th>{t('pages.table.name')}</th>
            <th>{t('pages.table.checksum')}</th>
            <th>{t('pages.table.download')}</th>
          </tr>
        </thead>
        <tbody>
          {artifacts.map(artifact => (
            <tr key={artifact.downloadUrl}>
              <td>{artifact.name}</td>
              <td>
                <code className="checksum text-break">
                  {artifact.checksumType}:{artifact.checksum}
                </code>
              </td>
              <td>
                <a href={artifact.downloadUrl} className="btn btn-sm btn-outline-primary">
                  {t('pages.table.download')}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
};

ArtifactsTable.propTypes = {
  artifacts: PropTypes.arrayOf(PropTypes.object).isRequired,
};

const MetaRow = ({ entry }) => {
  const { t } = useTranslation();
  const rows = [
    ['description', entry.description],
    ['createdAt', localeDate(entry.createdAt)],
    ['updatedAt', localeDate(entry.updatedAt)],
  ].filter(([, value]) => value);
  return (
    <div className="d-flex flex-wrap gap-4 text-muted small mb-3">
      {rows.map(([key, value]) => (
        <span key={key}>
          {t(`pages.version.${key}`)}: <strong className="text-body">{value}</strong>
        </span>
      ))}
    </div>
  );
};

MetaRow.propTypes = {
  entry: versionShape.isRequired,
};

const VersionSummary = ({ entry, manage, actions, slots, slotProps }) => {
  const { t } = useTranslation();
  const { VersionBannerActions, VersionNotesActions } = slots;
  return (
    <div className="mb-4">
      <PageHeader
        title={t('pages.version.title', { version: entry.version })}
        chips={entry.deprecated ? <StatusChips deprecated /> : null}
        actions={actions}
      />
      <DeprecationBanner version={entry}>
        {VersionBannerActions ? <VersionBannerActions {...slotProps} /> : null}
      </DeprecationBanner>
      {entry.releaseNotes || (manage && VersionNotesActions) ? (
        <div className="card mb-3">
          <div className="card-header">
            <h5 className="mb-0">{t('pages.version.releaseNotes')}</h5>
          </div>
          <div className="card-body">
            {entry.releaseNotes ? <Markdown>{entry.releaseNotes}</Markdown> : null}
            {VersionNotesActions ? <VersionNotesActions {...slotProps} /> : null}
          </div>
        </div>
      ) : null}
      <MetaRow entry={entry} />
    </div>
  );
};

VersionSummary.propTypes = {
  entry: versionShape.isRequired,
  manage: PropTypes.bool.isRequired,
  actions: PropTypes.node,
  slots: PropTypes.object.isRequired,
  slotProps: PropTypes.object.isRequired,
};

const ProvidersTable = ({ collection, org, name, entry, slotProps }) => {
  const { t } = useTranslation();
  const { ProviderRowActions } = collection.slots;
  return (
    <Table striped className="table">
      <thead>
        <tr>
          <th>{t('pages.table.name')}</th>
          <th>{t('pages.table.details')}</th>
          <th>{t('pages.table.download')}</th>
          {ProviderRowActions ? <th>{t('pages.table.actions')}</th> : null}
        </tr>
      </thead>
      <tbody>
        {(entry.providers || []).map(provider => (
          <tr key={provider.name}>
            <td>
              <Link to={providerPath(collection, org, name, entry.version, provider.name)}>
                {provider.name}
              </Link>
            </td>
            <td>{provider.description}</td>
            <td>
              {(provider.architectures || [])
                .filter(architecture => architecture.downloadUrl)
                .map(architecture => (
                  <div key={architecture.name}>
                    <a
                      href={architecture.downloadUrl}
                      className="btn btn-outline-primary mt-2"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('pages.table.download')} {architecture.name}
                    </a>
                  </div>
                ))}
            </td>
            {ProviderRowActions ? (
              <td>
                <ProviderRowActions {...slotProps} provider={provider} />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </Table>
  );
};

ProvidersTable.propTypes = {
  collection: collectionShape.isRequired,
  org: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  entry: versionShape.isRequired,
  slotProps: PropTypes.object.isRequired,
};

const VersionPage = ({ collection, org, name, version, context }) => {
  const { t, i18n } = useTranslation();
  const [noticeNode, notify] = useNotice();
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState({ key: '', item: null, entry: null });
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(null);
  const key = `${org}/${name}/${version}/${nonce}`;
  const ready = data.key === key;
  const { item, entry } = data;

  useEffect(() => {
    let mounted = true;
    Promise.all([
      collection.adapter.getItemSummary(org, name),
      collection.adapter.getVersion(org, name, version),
    ])
      .then(([loadedItem, loadedEntry]) => {
        if (mounted) {
          setData({ key, item: loadedItem, entry: loadedEntry });
        }
      })
      .catch(() => {
        if (mounted) {
          setData({ key, item: null, entry: null });
          notify('danger', t('pages.notFound'));
        }
      });
    return () => {
      mounted = false;
    };
  }, [key, collection, org, name, version, notify, t]);

  useEffect(() => {
    document.title = `${name} v${version}`;
  }, [name, version]);

  const { VersionActions, ProvidersActions } = collection.slots;
  const ctx = {
    ...context,
    t,
    language: i18n.language,
    org,
    collection,
    reload: () => setNonce(current => current + 1),
    notify,
    setEditor,
    setForm,
  };
  const manage = Boolean(item && collection.canManage && collection.canManage(item, context.user));

  if (!ready) {
    return (
      <div className="list row">
        {noticeNode}
        <div>{t('pages.loading')}</div>
      </div>
    );
  }
  if (!entry) {
    return <div className="list row">{noticeNode}</div>;
  }

  const slotProps = { item, version: entry, ctx };
  const actions = VersionActions ? <VersionActions {...slotProps} /> : null;
  const artifacts = entry.artifacts || [];

  return (
    <div className="list row">
      {noticeNode}
      {editor ? (
        <div className="mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4>{t('pages.version.edit')}</h4>
            <div>{actions}</div>
          </div>
          {editor}
        </div>
      ) : (
        <VersionSummary
          entry={entry}
          manage={manage}
          actions={actions}
          slots={collection.slots}
          slotProps={slotProps}
        />
      )}
      {artifacts.length > 0 ? <ArtifactsTable artifacts={artifacts} /> : null}
      <div className="list-table">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4>{t('pages.version.providersFor', { version: entry.version })}</h4>
          {ProvidersActions ? <ProvidersActions {...slotProps} /> : null}
        </div>
        {form}
        <ProvidersTable
          collection={collection}
          org={org}
          name={name}
          entry={entry}
          slotProps={slotProps}
        />
      </div>
    </div>
  );
};

VersionPage.propTypes = {
  collection: collectionShape.isRequired,
  org: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  version: PropTypes.string.isRequired,
  context: pageContextShape.isRequired,
};

export default VersionPage;
