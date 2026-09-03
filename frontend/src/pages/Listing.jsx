import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaList, FaTableCellsLarge } from 'react-icons/fa6';

import { useNotify } from '../chrome';

import ItemCards from './ItemCards';
import { collectionShape, pageContextShape } from './itemShape';
import ItemsTable from './ItemsTable';
import { useCatalogSearch } from './useCatalogSearch';

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

const NO_IDS = new Set();

const useWatches = ({ collections, user, notify }) => {
  const { t } = useTranslation();
  const [ids, setIds] = useState({});
  const signedIn = Boolean(user);
  const available = signedIn && collections.some(collection => collection.adapter.watches);

  useEffect(() => {
    const watchable = collections.filter(collection => collection.adapter.watches);
    if (!signedIn || watchable.length === 0) {
      return undefined;
    }
    let mounted = true;
    Promise.all(
      watchable.map(collection =>
        collection.adapter.watches
          .list()
          .then(loaded => [collection.key, loaded])
          .catch(() => [collection.key, NO_IDS])
      )
    ).then(entries => {
      if (mounted) {
        setIds(Object.fromEntries(entries));
      }
    });
    return () => {
      mounted = false;
    };
  }, [signedIn, collections]);

  const toggle = (collection, item) => {
    const next = !(ids[collection.key] || NO_IDS).has(item.id);
    const apply = (all, watched) => {
      const copy = new Set(all[collection.key] || []);
      if (watched) {
        copy.add(item.id);
      } else {
        copy.delete(item.id);
      }
      return { ...all, [collection.key]: copy };
    };
    setIds(all => apply(all, next));
    collection.adapter.watches.toggle(item, next).catch(() => {
      setIds(all => apply(all, !next));
      notify('danger', t('pages.watch.error'));
    });
  };

  return { ids, toggle, available };
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
 * page spans organizations, and the page's actions with the one view toggle
 * on the header row when the page has a header, else on the first
 * collection's heading row.
 */
const Listing = ({ collections, org, member, grouped, context, header = null, actions = null }) => {
  const { t, i18n } = useTranslation();
  const notify = useNotify();
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
              notify(items.notice.type, t(items.notice.key), {
                tier: 'banner',
                key: items.notice.key,
              });
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
  const {
    visible,
    filtered,
    filtering,
    sort,
    setSort,
    view,
    setView,
    collapsed,
    toggleCollapsed,
    hiddenColumns,
  } = search;

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
      watches:
        watches.available && collection.adapter.watches
          ? {
              ids: watches.ids[collection.key] || NO_IDS,
              toggle: item => watches.toggle(collection, item),
            }
          : null,
      ctx: ctxFor(collection),
    };
    if (view === 'cards') {
      return <ItemCards {...shared} />;
    }
    return (
      <ItemsTable
        {...shared}
        sort={sort[collection.key]}
        onSort={column => setSort(collection.key, column)}
        hiddenColumns={hiddenColumns[collection.key]}
      />
    );
  };

  const renderCollection = (collection, index) => {
    const items = filtered[collection.key];
    const { ListActions } = collection.slots;
    return (
      <div key={collection.key} className="mb-4">
        <CollectionHeading collection={collection} count={items.length}>
          {ListActions ? <ListActions ctx={ctxFor(collection)} /> : null}
          {!header && index === 0 ? actions : null}
          {!header && index === 0 ? toggle : null}
        </CollectionHeading>
        {listOf(collection, items)}
      </div>
    );
  };

  return (
    <div className="list row">
      {header ? (
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap mb-3">
          <div className="d-flex align-items-center gap-3 min-width-0">{header}</div>
          <div className="d-flex align-items-center gap-2 ms-auto">
            {actions}
            {toggle}
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
