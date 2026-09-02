import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaRegStar, FaStar } from 'react-icons/fa6';
import Markdown from 'react-markdown';
import { Link } from 'react-router-dom';

import { providerPath, versionPath } from '../chrome';

import ItemFacts from './ItemFacts';
import {
  collectionShape,
  pageContextShape,
  sortVersionsNewestFirst,
  statusOf,
  visibilityOf,
} from './itemShape';
import PageHeader from './PageHeader';
import StatusChips from './StatusChips';
import { useNotice } from './useNotice';

const Readme = ({ readme }) => {
  const { t } = useTranslation();
  return (
    <div className="card h-100">
      <div className="card-header">
        <h5 className="mb-0">{t('pages.item.readme')}</h5>
      </div>
      <div className="card-body">
        <Markdown>{readme}</Markdown>
      </div>
    </div>
  );
};

Readme.propTypes = {
  readme: PropTypes.string.isRequired,
};

const WatchStar = ({ watched, busy, onToggle }) => {
  const { t } = useTranslation();
  const label = watched ? t('pages.watch.unwatch') : t('pages.watch.watch');
  return (
    <button
      type="button"
      className="btn btn-link p-0 text-warning fs-5 v-align-middle"
      onClick={onToggle}
      disabled={busy}
      title={label}
      aria-label={label}
      aria-pressed={watched}
    >
      {watched ? <FaStar /> : <FaRegStar />}
    </button>
  );
};

WatchStar.propTypes = {
  watched: PropTypes.bool.isRequired,
  busy: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
};

const useItemWatch = ({ collection, item, signedIn, notify }) => {
  const { t } = useTranslation();
  const [watched, setWatched] = useState(false);
  const [busy, setBusy] = useState(false);
  const { watches } = collection.adapter;

  useEffect(() => {
    if (!watches || !signedIn || !item) {
      return undefined;
    }
    let mounted = true;
    watches
      .list()
      .then(ids => {
        if (mounted) {
          setWatched(ids.has(item.id));
        }
      })
      .catch(() => null);
    return () => {
      mounted = false;
    };
  }, [watches, signedIn, item]);

  const toggle = () => {
    const next = !watched;
    setWatched(next);
    setBusy(true);
    watches
      .toggle(item, next)
      .catch(() => {
        setWatched(!next);
        notify('danger', t('pages.watch.error'));
      })
      .finally(() => setBusy(false));
  };

  return { available: Boolean(watches) && signedIn, watched, busy, toggle };
};

const mediaFor = item => {
  if (item.artwork) {
    return <img src={item.artwork} alt="" className="rounded item-artwork" />;
  }
  if (item.icon) {
    return (
      <img
        src={item.icon}
        alt=""
        className="prov-icon"
        loading="lazy"
        onError={event => {
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  }
  return null;
};

const shortChecksum = artifact =>
  `${artifact.checksumType}:${artifact.checksum.slice(0, 4)}…${artifact.checksum.slice(-4)}`;

const ArtifactLinks = ({ artifacts }) => {
  const { t } = useTranslation();
  return artifacts.map(artifact => (
    <div key={artifact.downloadUrl} className="d-flex align-items-center gap-2 flex-wrap">
      <a href={artifact.downloadUrl}>{t('pages.table.download')}</a>
      <code className="checksum" title={`${artifact.checksumType}:${artifact.checksum}`}>
        {shortChecksum(artifact)}
      </code>
    </div>
  ));
};

ArtifactLinks.propTypes = {
  artifacts: PropTypes.arrayOf(PropTypes.object).isRequired,
};

const VersionsTable = ({ collection, item, org, ctx }) => {
  const { t } = useTranslation();
  const { VersionRowActions } = collection.slots;
  const versions = sortVersionsNewestFirst(item.versions || []);
  const hasReleased = versions.some(version => version.createdAt);
  const hasDetails = versions.some(version => version.description);
  const hasProviders = versions.some(version => (version.providers || []).length > 0);
  const hasArtifacts = versions.some(version => (version.artifacts || []).length > 0);
  return (
    <Table striped className="table">
      <thead>
        <tr>
          <th>{t('pages.table.version')}</th>
          {hasReleased ? <th>{t('pages.version.released')}</th> : null}
          {hasDetails ? <th>{t('pages.table.details')}</th> : null}
          {hasProviders ? <th>{t('pages.table.providers')}</th> : null}
          {hasArtifacts ? <th>{t('pages.version.artifacts')}</th> : null}
          {VersionRowActions ? <th>{t('pages.table.actions')}</th> : null}
        </tr>
      </thead>
      <tbody>
        {versions.map(version => (
          <tr key={version.version}>
            <td>
              <Link to={versionPath(collection, org, item.name, version.version)}>
                {version.version}
              </Link>
              {version.deprecated ? (
                <span className="badge bg-danger ms-2">{t('pages.status.deprecated')}</span>
              ) : null}
            </td>
            {hasReleased ? (
              <td>{version.createdAt ? new Date(version.createdAt).toLocaleDateString() : ''}</td>
            ) : null}
            {hasDetails ? <td>{version.description}</td> : null}
            {hasProviders ? (
              <td>
                {(version.providers || []).map(provider => (
                  <Link
                    key={provider.name}
                    to={providerPath(collection, org, item.name, version.version, provider.name)}
                    className="badge bg-secondary bg-opacity-50 text-body text-decoration-none me-1"
                  >
                    {provider.name}
                  </Link>
                ))}
              </td>
            ) : null}
            {hasArtifacts ? (
              <td>
                <ArtifactLinks artifacts={version.artifacts || []} />
              </td>
            ) : null}
            {VersionRowActions ? (
              <td>
                <VersionRowActions item={item} version={version} ctx={ctx} />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </Table>
  );
};

VersionsTable.propTypes = {
  collection: collectionShape.isRequired,
  item: PropTypes.object.isRequired,
  org: PropTypes.string.isRequired,
  ctx: PropTypes.object.isRequired,
};

const ItemPage = ({ collection, org, name, context }) => {
  const { t, i18n } = useTranslation();
  const [noticeNode, notify] = useNotice();
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState({ key: '', item: null });
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(null);
  const key = `${org}/${name}/${nonce}`;
  const ready = data.key === key;
  const { item } = data;
  const signedIn = Boolean(context.user);
  const watch = useItemWatch({ collection, item: ready ? item : null, signedIn, notify });

  useEffect(() => {
    let mounted = true;
    collection.adapter
      .getItem(org, name)
      .then(loaded => {
        if (mounted) {
          setData({ key, item: loaded });
        }
      })
      .catch(() => {
        if (mounted) {
          setData({ key, item: null });
          notify('danger', t('pages.notFound'));
        }
      });
    return () => {
      mounted = false;
    };
  }, [key, collection, org, name, notify, t]);

  useEffect(() => {
    document.title = ready && item ? item.label || item.name : name;
  }, [ready, item, name]);

  const { ItemActions, ItemChips, ItemHeaderExtra, ItemExtras, VersionsActions } = collection.slots;
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

  if (!ready) {
    return (
      <div className="list row">
        {noticeNode}
        <div>{t('pages.loading')}</div>
      </div>
    );
  }
  if (!item) {
    return <div className="list row">{noticeNode}</div>;
  }

  const actions = ItemActions ? <ItemActions item={item} ctx={ctx} /> : null;
  const title = (
    <>
      {item.label || item.name}
      {watch.available ? (
        <span className="ms-2 align-middle">
          <WatchStar watched={watch.watched} busy={watch.busy} onToggle={watch.toggle} />
        </span>
      ) : null}
    </>
  );
  const chips = (
    <>
      <StatusChips
        status={statusOf(item)}
        visibility={visibilityOf(item)}
        osLabel={item.os?.label || null}
      />
      {ItemChips ? <ItemChips item={item} ctx={ctx} /> : null}
    </>
  );

  return (
    <div className="list row">
      {noticeNode}
      {editor ? (
        <div className="mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h4>{t('pages.item.details')}</h4>
            <div>{actions}</div>
          </div>
          {editor}
        </div>
      ) : (
        <PageHeader
          media={mediaFor(item)}
          title={title}
          subtitle={`${org} / ${item.name}`}
          chips={chips}
          actions={actions}
        >
          {item.description ? <p className="mb-0 mt-2">{item.description}</p> : null}
          {ItemHeaderExtra ? <ItemHeaderExtra item={item} ctx={ctx} /> : null}
        </PageHeader>
      )}
      {ItemExtras ? <ItemExtras item={item} ctx={ctx} /> : null}
      {item.metadata || item.readme ? (
        <div className="row g-3 mb-4 mx-0 px-0">
          {item.metadata ? (
            <div className="col-lg-5 col-xl-4">
              <ItemFacts item={item} />
            </div>
          ) : null}
          {item.readme ? (
            <div className="col">
              <Readme readme={item.readme} />
            </div>
          ) : null}
        </div>
      ) : null}
      {collection.hasVersions ? (
        <>
          <div className="list-table">
            <div className="d-flex justify-content-between align-items-center">
              <h4>{t('pages.item.versions')}</h4>
              {VersionsActions ? <VersionsActions item={item} ctx={ctx} /> : null}
            </div>
          </div>
          {form}
          <VersionsTable collection={collection} item={item} org={org} ctx={ctx} />
        </>
      ) : null}
    </div>
  );
};

ItemPage.propTypes = {
  collection: collectionShape.isRequired,
  org: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  context: pageContextShape.isRequired,
};

export default ItemPage;
