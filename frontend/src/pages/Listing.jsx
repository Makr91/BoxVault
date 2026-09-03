import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaList, FaTableCellsLarge } from 'react-icons/fa6';

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
      groups.set(key, { key: `org:${key}`, organization: item.organization, items: [] });
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

const CollectionHeading = ({ collection, count, children }) => {
  const { t } = useTranslation();
  return (
    <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
      <h2 className="h5 mb-0 me-auto d-flex align-items-center gap-2">
        {collection.icon}
        {t(collection.labelKey)}
        <span className="badge bg-secondary bg-opacity-50">{count}</span>
      </h2>
      {children}
    </div>
  );
};

CollectionHeading.propTypes = {
  collection: collectionShape.isRequired,
  count: PropTypes.number.isRequired,
  children: PropTypes.node,
};

/**
 * The one listing behind the home, organization and collection pages: loads
 * every collection it is given, registers the search binding, and draws one
 * heading row per collection carrying that collection's list actions, one
 * table or card grid per collection with organization group rows when the
 * page spans organizations, and one view toggle per page.
 */
const Listing = ({ collections, org, member, grouped, context, header = null, actions = null }) => {
  const { t, i18n } = useTranslation();
  const [noticeNode, notify] = useNotice();
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState({ key: '', byCollection: {} });
  const signedIn = Boolean(context.user);
  const key = `${org}|${member}|${signedIn}|${nonce}|${collections.map(c => c.key).join(',')}`;
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
  const search = useCatalogSearch({
    collections,
    itemsByCollection: data.byCollection,
    org,
    signedIn,
    watchedIds: watches.ids,
    prefsKey: `${context.prefsPrefix}_${org || 'home'}`,
  });
  const { visible, filtered, filtering, sort, setSort, view, setView, collapsed, toggleCollapsed } =
    search;

  const toggleInHeading = collections.length === 1 && !grouped;
  const toggle = <ViewToggle view={view} onChange={setView} />;

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

  const listOf = (collection, items) => {
    const shared = {
      collection,
      items,
      groups: grouped ? groupByOrganization(items) : null,
      collapsed,
      onToggleGroup: toggleCollapsed,
      watches: watches.available && collection.adapter.watches ? watches : null,
      ctx: ctxFor(collection),
    };
    if (view === 'cards') {
      return <ItemCards {...shared} />;
    }
    return (
      <ItemsTable
        {...shared}
        watchColumn={watches.available}
        sort={sort[collection.key]}
        onSort={column => setSort(collection.key, column)}
      />
    );
  };

  const renderCollection = collection => {
    const items = filtered[collection.key];
    const { ListActions } = collection.slots;
    return (
      <div key={collection.key} className="mb-4">
        <CollectionHeading collection={collection} count={items.length}>
          {ListActions ? <ListActions ctx={ctxFor(collection)} /> : null}
          {toggleInHeading ? toggle : null}
        </CollectionHeading>
        {listOf(collection, items)}
      </div>
    );
  };

  return (
    <div className="list row">
      {noticeNode}
      {header || actions || !toggleInHeading ? (
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
          <div className="d-flex align-items-center gap-3 min-width-0">{header}</div>
          <div className="d-flex align-items-center gap-2 ms-auto">
            {actions}
            {toggleInHeading ? null : toggle}
          </div>
        </div>
      ) : null}
      {ready ? visible.map(renderCollection) : <div>{t('pages.loading')}</div>}
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
  actions: PropTypes.node,
};

export default Listing;
