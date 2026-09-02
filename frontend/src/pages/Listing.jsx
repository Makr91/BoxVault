import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaList, FaTableCellsLarge } from 'react-icons/fa6';
import { Link } from 'react-router-dom';

import { OrgLogo, collectionPath } from '../chrome';

import ItemCards from './ItemCards';
import { collectionShape, pageContextShape } from './itemShape';
import ItemsTable from './ItemsTable';
import { useCatalogSearch } from './useCatalogSearch';
import { useNotice } from './useNotice';

const groupByOrganization = items => {
  const groups = new Map();
  items.forEach(item => {
    const key = item.organization.name;
    if (!groups.has(key)) {
      groups.set(key, { organization: item.organization, items: [] });
    }
    groups.get(key).items.push(item);
  });
  return [...groups.values()];
};

const useWatches = ({ collections, user, notify }) => {
  const { t } = useTranslation();
  const [ids, setIds] = useState(() => new Set());
  const watchable = collections.find(collection => collection.adapter.watches);
  const signedIn = Boolean(user);

  useEffect(() => {
    if (!signedIn || !watchable) {
      return undefined;
    }
    let mounted = true;
    watchable.adapter.watches
      .list()
      .then(loaded => {
        if (mounted) {
          setIds(loaded);
        }
      })
      .catch(() => null);
    return () => {
      mounted = false;
    };
  }, [signedIn, watchable]);

  const toggle = item => {
    const next = !ids.has(item.id);
    const apply = (current, watched) => {
      const copy = new Set(current);
      if (watched) {
        copy.add(item.id);
      } else {
        copy.delete(item.id);
      }
      return copy;
    };
    setIds(current => apply(current, next));
    watchable.adapter.watches.toggle(item, next).catch(() => {
      setIds(current => apply(current, !next));
      notify('danger', t('pages.watch.error'));
    });
  };

  return { ids, toggle, available: signedIn && Boolean(watchable) };
};

const ViewToggle = ({ view, onChange }) => {
  const { t } = useTranslation();
  const options = [
    { key: 'table', icon: <FaList />, label: t('pages.view.table') },
    { key: 'cards', icon: <FaTableCellsLarge />, label: t('pages.view.cards') },
  ];
  return (
    <div className="btn-group btn-group-sm" role="group" aria-label={t('pages.view.label')}>
      {options.map(option => (
        <button
          key={option.key}
          type="button"
          className={`btn ${view === option.key ? 'btn-secondary' : 'btn-outline-secondary'}`}
          onClick={() => onChange(option.key)}
          title={option.label}
          aria-label={option.label}
          aria-pressed={view === option.key}
        >
          {option.icon}
        </button>
      ))}
    </div>
  );
};

ViewToggle.propTypes = {
  view: PropTypes.oneOf(['table', 'cards']).isRequired,
  onChange: PropTypes.func.isRequired,
};

const CollectionHeading = ({ collection, count, org, linkAll, small, toggle }) => {
  const { t } = useTranslation();
  const Tag = small ? 'h3' : 'h2';
  return (
    <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2">
      <Tag className={`${small ? 'h6' : 'h5'} mb-0 d-flex align-items-center gap-2`}>
        {collection.icon}
        {t(collection.labelKey)}
        <span className="badge bg-secondary bg-opacity-50">{count}</span>
      </Tag>
      <div className="d-flex align-items-center gap-3">
        {linkAll ? (
          <Link to={collectionPath(collection, org)} className="small">
            {t('pages.all', { collection: t(collection.labelKey) })} ›
          </Link>
        ) : null}
        {toggle}
      </div>
    </div>
  );
};

CollectionHeading.propTypes = {
  collection: collectionShape.isRequired,
  count: PropTypes.number.isRequired,
  org: PropTypes.string.isRequired,
  linkAll: PropTypes.bool.isRequired,
  small: PropTypes.bool.isRequired,
  toggle: PropTypes.node,
};

const Listing = ({ collections, org, member, grouped, context, header }) => {
  const { t, i18n } = useTranslation();
  const [noticeNode, notify] = useNotice();
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState({ key: '', byCollection: {} });
  const key = `${org}|${member}|${nonce}|${collections.map(c => c.key).join(',')}`;
  const ready = data.key === key;
  const reload = () => setNonce(current => current + 1);

  useEffect(() => {
    let mounted = true;
    Promise.all(
      collections.map(collection =>
        (org ? collection.adapter.listOrg(org, { member }) : collection.adapter.listAll())
          .then(items => {
            if (items.notice && mounted) {
              notify(items.notice.type, t(items.notice.key));
            }
            return [collection.key, items];
          })
          .catch(error => {
            notify('danger', error.messageKey ? t(error.messageKey) : error.message);
            return [collection.key, []];
          })
      )
    ).then(entries => {
      if (mounted) {
        setData({ key, byCollection: Object.fromEntries(entries) });
      }
    });
    return () => {
      mounted = false;
    };
  }, [key, collections, org, member, notify, t]);

  const watches = useWatches({ collections, user: context.user, notify });
  const { filtered, filtering, sort, setSort, view, setView } = useCatalogSearch({
    collections,
    itemsByCollection: data.byCollection,
    org,
    signedIn: Boolean(context.user),
    watchedIds: watches.ids,
    prefsKey: `${context.prefsPrefix}_${org || 'home'}`,
  });

  const ctxFor = collection => ({
    ...context,
    t,
    language: i18n.language,
    collection,
    org,
    member,
    filtering,
    reload,
    notify,
  });

  const toggleFor = collection => (
    <ViewToggle view={view[collection.key]} onChange={next => setView(collection.key, next)} />
  );

  const listOf = (collection, items) => {
    const shared = {
      collection,
      items,
      watches: watches.available && collection.adapter.watches ? watches : null,
      ctx: ctxFor(collection),
    };
    if (view[collection.key] === 'cards') {
      return <ItemCards {...shared} />;
    }
    return (
      <ItemsTable
        {...shared}
        sort={sort[collection.key]}
        onSort={column => setSort(collection.key, column)}
      />
    );
  };

  const renderGrouped = () => {
    const sections = new Map();
    collections.forEach(collection => {
      groupByOrganization(filtered[collection.key] || []).forEach(group => {
        if (!sections.has(group.organization.name)) {
          sections.set(group.organization.name, { organization: group.organization, parts: [] });
        }
        sections.get(group.organization.name).parts.push({ collection, items: group.items });
      });
    });
    const single = collections.length === 1;
    return (
      <>
        {single ? (
          <div className="d-flex justify-content-end mb-2">{toggleFor(collections[0])}</div>
        ) : null}
        {sections.size === 0 ? (
          <Alert variant="secondary">{filtering ? t('pages.noMatches') : t('pages.empty')}</Alert>
        ) : null}
        {[...sections.values()].map(section => (
          <div className="mb-4" key={section.organization.name}>
            <div className="d-flex align-items-center gap-2 mb-2">
              <OrgLogo
                org={section.organization}
                size={30}
                className="rounded-circle avatar-lg"
                fallback={context.orgMark}
              />
              <h5 className="mb-0">
                <Link to={`/${section.organization.name}`}>{section.organization.name}</Link>
              </h5>
              {section.parts.map(part => (
                <span key={part.collection.key} className="badge bg-secondary bg-opacity-50">
                  {t('pages.countOf', {
                    count: part.items.length,
                    collection: t(part.collection.labelKey),
                  })}
                </span>
              ))}
            </div>
            {section.parts.map(part => (
              <div key={part.collection.key} className="mb-3">
                {single ? null : (
                  <CollectionHeading
                    collection={part.collection}
                    count={part.items.length}
                    org={section.organization.name}
                    linkAll
                    small
                    toggle={toggleFor(part.collection)}
                  />
                )}
                {listOf(part.collection, part.items)}
              </div>
            ))}
          </div>
        ))}
      </>
    );
  };

  const renderFlat = () =>
    collections.map(collection => {
      const { ListActions } = collection.slots;
      const items = filtered[collection.key] || [];
      return (
        <div className="mb-4" key={collection.key}>
          <CollectionHeading
            collection={collection}
            count={items.length}
            org={org}
            linkAll={collections.length > 1 && Boolean(collection.segment)}
            small={false}
            toggle={toggleFor(collection)}
          />
          {ListActions ? (
            <div className="d-flex justify-content-end align-items-center mb-3 gap-2 flex-wrap">
              <ListActions ctx={ctxFor(collection)} />
            </div>
          ) : null}
          {listOf(collection, items)}
        </div>
      );
    });

  const renderBody = () => {
    if (!ready) {
      return <div>{t('pages.loading')}</div>;
    }
    return grouped ? renderGrouped() : renderFlat();
  };

  return (
    <div className="list row">
      {noticeNode}
      {header}
      {renderBody()}
    </div>
  );
};

Listing.propTypes = {
  collections: PropTypes.arrayOf(collectionShape).isRequired,
  org: PropTypes.string.isRequired,
  member: PropTypes.bool.isRequired,
  grouped: PropTypes.bool.isRequired,
  context: pageContextShape.isRequired,
  header: PropTypes.node,
};

export default Listing;
