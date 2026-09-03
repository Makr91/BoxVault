import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavbarSearchBinding } from '../chrome';

import { VISIBILITY_GROUP, WATCHED_GROUP, defaultMatches, filterGroupsOf } from './itemShape';
import { emptyFilters, readPrefs, toggleIn, writePrefs } from './prefs';

const groupShown = (group, { signedIn, org, items }) =>
  (!group.signedInOnly || signedIn) &&
  (!group.homeOnly || !org) &&
  (!group.orgOnly || Boolean(org)) &&
  (!group.shownFor || group.shownFor(items));

const orderedCounts = (counts, order) => {
  const keys = Object.keys(counts);
  const sorted = order
    ? [...order.filter(key => counts[key]), ...keys.filter(key => !order.includes(key)).sort()]
    : keys.sort();
  return Object.fromEntries(sorted.map(key => [key, counts[key]]));
};

const countValues = (items, group, ctx) => {
  const counts = {};
  items.forEach(item => {
    group.values(item, ctx).forEach(value => {
      counts[value] = (counts[value] || 0) + 1;
    });
  });
  return orderedCounts(counts, group.order);
};

const passesGroups = (item, groups, filters, ctx) =>
  groups.every(group => {
    const active = filters[group.key];
    return active.size === 0 || group.values(item, ctx).some(value => active.has(value));
  });

const passesVisibility = (item, visibility) =>
  visibility.size === 0 || VISIBILITY_GROUP.values(item).some(value => visibility.has(value));

const NO_IDS = new Set();

const passesWatched = (item, watched, watchedIds) =>
  watched.size === 0 ||
  WATCHED_GROUP.values(item, { watchedIds }).some(value => watched.has(value));

const sortItems = (items, sort, columns) => {
  const column = columns.find(entry => entry.key === sort.column);
  if (!column || !column.sortValue) {
    return items;
  }
  const direction = sort.direction === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const left = column.sortValue(a);
    const right = column.sortValue(b);
    if (left < right) {
      return -direction;
    }
    if (left > right) {
      return direction;
    }
    return 0;
  });
};

const watchSort = watchedIds => ({
  key: 'watch',
  sortValue: item => (watchedIds.has(item.id) ? 0 : 1),
});

const nextSort = (current, column) => {
  if (current.column !== column) {
    return { column, direction: 'asc' };
  }
  if (current.direction === 'asc') {
    return { column, direction: 'desc' };
  }
  return { column: '', direction: 'asc' };
};

const collectionGroup = (collections, itemsByCollection, prefs, setPrefs, t) => ({
  key: 'collection',
  label: t('pages.filter.collection'),
  entries: Object.fromEntries(
    collections.map(collection => [
      collection.key,
      (itemsByCollection[collection.key] || []).length,
    ])
  ),
  activeSet: prefs.collection,
  activeClass: 'bg-primary',
  labelFor: key => t(collections.find(collection => collection.key === key).labelKey),
  onToggle: value =>
    setPrefs(current => ({ ...current, collection: toggleIn(current.collection, value) })),
});

const visibilityGroup = (items, prefs, setPrefs, ctx, t) => ({
  key: VISIBILITY_GROUP.key,
  label: t(VISIBILITY_GROUP.labelKey),
  entries: countValues(items, VISIBILITY_GROUP, ctx),
  activeSet: prefs.visibility,
  activeClass: VISIBILITY_GROUP.activeClass,
  labelFor: value => VISIBILITY_GROUP.labelFor(value, t),
  onToggle: value =>
    setPrefs(current => ({ ...current, visibility: toggleIn(current.visibility, value) })),
});

const watchedGroup = (visible, itemsByCollection, watchedIds, prefs, setPrefs, t) => {
  const entries = {};
  visible.forEach(collection => {
    if (!watchedIds[collection.key]) {
      return;
    }
    const counts = countValues(itemsByCollection[collection.key] || [], WATCHED_GROUP, {
      watchedIds: watchedIds[collection.key],
      t,
    });
    Object.entries(counts).forEach(([value, count]) => {
      entries[value] = (entries[value] || 0) + count;
    });
  });
  return {
    key: WATCHED_GROUP.key,
    label: t(WATCHED_GROUP.labelKey),
    entries,
    activeSet: prefs.watched,
    activeClass: WATCHED_GROUP.activeClass,
    labelFor: value => WATCHED_GROUP.labelFor(value, t),
    onToggle: value =>
      setPrefs(current => ({ ...current, watched: toggleIn(current.watched, value) })),
  };
};

const groupLabel = (collection, labelKey, prefixed, t) =>
  prefixed ? `${t(collection.labelKey)} · ${t(labelKey)}` : t(labelKey);

const ownGroup = ({ collection, group, items, filters, prefixed, setPrefs, ctx, t }) => ({
  key: `${collection.key}.${group.key}`,
  label: groupLabel(collection, group.labelKey, prefixed, t),
  entries: countValues(items, group, ctx),
  activeSet: filters[group.key],
  activeClass: group.activeClass,
  pillClass: group.pillClass,
  labelFor: group.labelFor ? value => group.labelFor(value, t) : undefined,
  onToggle: value =>
    setPrefs(current => ({
      ...current,
      filters: {
        ...current.filters,
        [collection.key]: {
          ...current.filters[collection.key],
          [group.key]: toggleIn(current.filters[collection.key][group.key], value),
        },
      },
    })),
});

const columnsGroup = ({ collection, hidden, prefixed, setPrefs, t }) => ({
  key: `${collection.key}.columns`,
  label: groupLabel(collection, 'pages.filter.columns', prefixed, t),
  entries: Object.fromEntries(collection.columns.map(column => [column.key, null])),
  activeSet: new Set(collection.columns.map(column => column.key).filter(key => !hidden.has(key))),
  activeClass: 'bg-secondary',
  columns: true,
  labelFor: key => t(collection.columns.find(column => column.key === key).labelKey),
  onToggle: key =>
    setPrefs(current => ({
      ...current,
      hiddenColumns: {
        ...current.hiddenColumns,
        [collection.key]: toggleIn(current.hiddenColumns[collection.key], key),
      },
    })),
});

/**
 * Registers one navbar search binding for a page that lists one or more
 * collections, and returns the collections left visible by the Collection
 * group plus the filtered, sorted items per collection. The Collection,
 * Visibility and Watched groups are shared across the page; the collection's
 * own groups follow them and, in list view, a Columns group per collection
 * that shows or hides that table's columns. Watched ids arrive as one Set per
 * collection key, because item ids only mean something inside their own
 * collection. Filters, sort, the one view, the hidden columns and the
 * collapsed groups persist per page under the app's prefs prefix.
 */
export const useCatalogSearch = ({
  collections,
  itemsByCollection,
  org,
  signedIn,
  watchedIds,
  prefsKey,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [prefs, setPrefs] = useState(() => readPrefs(prefsKey, collections));

  useEffect(() => {
    writePrefs(prefsKey, prefs);
  }, [prefsKey, prefs]);

  const idsFor = collection => watchedIds[collection.key] || NO_IDS;
  const needle = query.trim().toLowerCase();
  const visible = collections.filter(
    collection => prefs.collection.size === 0 || prefs.collection.has(collection.key)
  );
  const visibleItems = visible.flatMap(collection => itemsByCollection[collection.key] || []);
  const total = collections.reduce(
    (sum, collection) => sum + (itemsByCollection[collection.key] || []).length,
    0
  );
  const prefixed = collections.length > 1;
  const groups = [];
  if (collections.length > 1) {
    groups.push(collectionGroup(collections, itemsByCollection, prefs, setPrefs, t));
  }
  if (groupShown(VISIBILITY_GROUP, { signedIn, org, items: visibleItems })) {
    groups.push(visibilityGroup(visibleItems, prefs, setPrefs, { t }, t));
  }
  if (signedIn) {
    const watched = watchedGroup(visible, itemsByCollection, watchedIds, prefs, setPrefs, t);
    if (Object.keys(watched.entries).length > 0) {
      groups.push(watched);
    }
  }

  const filtered = {};
  let matched = 0;
  visible.forEach(collection => {
    const items = itemsByCollection[collection.key] || [];
    const ctx = { watchedIds: idsFor(collection), t };
    const shown = filterGroupsOf(collection).filter(group =>
      groupShown(group, { signedIn, org, items })
    );
    const filters = prefs.filters[collection.key];
    const hidden = prefs.hiddenColumns[collection.key];
    const matches = collection.matches || defaultMatches;
    const passing = items.filter(
      item =>
        (needle === '' || matches(item, needle)) &&
        passesVisibility(item, prefs.visibility) &&
        passesWatched(item, prefs.watched, ctx.watchedIds) &&
        passesGroups(item, shown, filters, ctx)
    );
    filtered[collection.key] = sortItems(passing, prefs.sort[collection.key], [
      watchSort(ctx.watchedIds),
      ...collection.columns.filter(column => !hidden.has(column.key)),
    ]);
    matched += passing.length;
    shown.forEach(group => {
      const own = ownGroup({ collection, group, items, filters, prefixed, setPrefs, ctx, t });
      if (Object.keys(own.entries).length > 0) {
        groups.push(own);
      }
    });
    if (prefs.view === 'table') {
      groups.push(columnsGroup({ collection, hidden, prefixed, setPrefs, t }));
    }
  });

  useNavbarSearchBinding({
    query,
    onQueryChange: setQuery,
    placeholder: collections.length === 1 ? t(collections[0].searchKey) : t('pages.searchAll'),
    matched,
    total,
    groups,
    onClearFilters: () => setPrefs(current => ({ ...current, ...emptyFilters(collections) })),
  });

  const filtering =
    needle !== '' ||
    prefs.collection.size > 0 ||
    prefs.visibility.size > 0 ||
    prefs.watched.size > 0 ||
    Object.values(prefs.filters).some(groupsOfCollection =>
      Object.values(groupsOfCollection).some(set => set.size > 0)
    );

  const setSort = (collectionKey, column) =>
    setPrefs(current => ({
      ...current,
      sort: { ...current.sort, [collectionKey]: nextSort(current.sort[collectionKey], column) },
    }));

  const setView = view => setPrefs(current => ({ ...current, view }));

  const toggleCollapsed = groupKey =>
    setPrefs(current => ({
      ...current,
      collapsed: { ...current.collapsed, [groupKey]: !current.collapsed[groupKey] },
    }));

  return {
    visible,
    filtered,
    filtering,
    sort: prefs.sort,
    setSort,
    view: prefs.view,
    setView,
    collapsed: prefs.collapsed,
    toggleCollapsed,
    hiddenColumns: prefs.hiddenColumns,
  };
};
