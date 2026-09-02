import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

import { collectionShape, pageContextShape } from './itemShape';
import PageHeader from './PageHeader';
import { useNotice } from './useNotice';

const shortChecksum = checksum =>
  `${checksum.substring(0, 20)}...${checksum.substring(checksum.length - 20)}`;

const ProviderPage = ({ collection, org, name, version, provider, context }) => {
  const { t, i18n } = useTranslation();
  const [noticeNode, notify] = useNotice();
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState({ key: '', item: null, entry: null });
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(null);
  const key = `${org}/${name}/${version}/${provider}/${nonce}`;
  const ready = data.key === key;
  const { item, entry } = data;

  useEffect(() => {
    let mounted = true;
    Promise.all([
      collection.adapter.getItemSummary(org, name),
      collection.adapter.getProvider(org, name, version, provider),
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
  }, [key, collection, org, name, version, provider, notify, t]);

  useEffect(() => {
    document.title = `${provider} - ${name}`;
  }, [provider, name]);

  const { ProviderActions, ArchitecturesActions, ArchitectureRowActions } = collection.slots;
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

  const copyChecksum = checksum => {
    navigator.clipboard.writeText(checksum).then(
      () => notify('success', t('pages.provider.checksumCopied')),
      () => notify('danger', t('pages.provider.copyFailed'))
    );
  };

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

  const slotProps = { item, version, provider: entry, ctx };
  const actions = ProviderActions ? <ProviderActions {...slotProps} /> : null;
  const architectures = entry.architectures || [];

  return (
    <div className="list row">
      {noticeNode}
      {editor ? (
        <div className="mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4>{t('pages.provider.edit')}</h4>
            <div>{actions}</div>
          </div>
          {editor}
        </div>
      ) : (
        <PageHeader title={entry.name} subtitle={entry.description || ''} actions={actions} />
      )}
      <div className="list-table mt-2">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h4>{t('pages.provider.architecturesFor', { provider: entry.name })}</h4>
          {ArchitecturesActions ? <ArchitecturesActions {...slotProps} /> : null}
        </div>
        {form}
        <Table striped className="table">
          <thead>
            <tr>
              <th>{t('pages.table.name')}</th>
              <th>{t('pages.table.defaultBox')}</th>
              <th>{t('pages.table.fileSize')}</th>
              <th>{t('pages.table.checksum')}</th>
              <th>{t('pages.table.checksumType')}</th>
              <th>{t('pages.table.download')}</th>
              {ArchitectureRowActions ? <th>{t('pages.table.actions')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {architectures.map(architecture => (
              <tr key={architecture.name}>
                <td>{architecture.name}</td>
                <td>{architecture.defaultBox ? t('yes') : t('no')}</td>
                <td>
                  {architecture.fileSize ? context.formatFileSize(architecture.fileSize) : 'N/A'}
                </td>
                <td>
                  {architecture.checksum ? (
                    <button
                      type="button"
                      className="btn btn-link p-0 text-clickable"
                      onClick={() => copyChecksum(architecture.checksum)}
                      title={t('pages.provider.clickToCopy')}
                    >
                      {shortChecksum(architecture.checksum)}
                    </button>
                  ) : (
                    'N/A'
                  )}
                </td>
                <td>{architecture.checksumType || 'N/A'}</td>
                <td>
                  {architecture.downloadUrl ? (
                    <a
                      href={architecture.downloadUrl}
                      className="btn btn-outline-primary"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t('pages.table.download')}
                      {typeof architecture.downloadCount === 'number'
                        ? ` (${architecture.downloadCount})`
                        : ''}
                    </a>
                  ) : null}
                </td>
                {ArchitectureRowActions ? (
                  <td>
                    <ArchitectureRowActions {...slotProps} architecture={architecture} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
};

ProviderPage.propTypes = {
  collection: collectionShape.isRequired,
  org: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  version: PropTypes.string.isRequired,
  provider: PropTypes.string.isRequired,
  context: pageContextShape.isRequired,
};

export default ProviderPage;
