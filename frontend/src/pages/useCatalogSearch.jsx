import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavbarSearchBinding } from '../chrome';

import { defaultMatches, filterGroupsOf } from './itemShape';
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

const itemPasses = (item, collection, groups, filters, needle, ctx) =>
  (needle === '' || (collection.matches || defaultMatches)(item, needle)) &&
  groups.every(group => {
    const active = filters[group.key];
    return active.size === 0 || group.values(item, ctx).some(value => active.has(value));
  });

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

const nextSort = (current, column) => {
  if (current.column !== column) {
    return { column, direction: 'asc' };
  }
  if (current.direction === 'asc') {
    return { column, direction: 'desc' };
  }
  return { column: '', direction: 'asc' };
};

/**
 * Registers one navbar search binding for a page that lists one or more
 * collections, and returns the filtered, sorted items per collection. The
 * active filters, the sort, the view and the collapsed groups are persisted
 * per page under the app's prefs prefix.
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

  const ctx = { watchedIds, t };
  const needle = query.trim().toLowerCase();
  const filtered = {};
  const groups = [];
  let matched = 0;
  let total = 0;

  collections.forEach(collection => {
    const items = itemsByCollection[collection.key] || [];
    const shown = filterGroupsOf(collection).filter(group =>
      groupShown(group, { signedIn, org, items })
    );
    const filters = prefs.filters[collection.key];
    const passing = items.filter(item => itemPasses(item, collection, shown, filters, needle, ctx));
    filtered[collection.key] = sortItems(passing, prefs.sort[collection.key], collection.columns);
    matched += passing.length;
    total += items.length;
    shown.forEach(group => {
      groups.push({
        key: `${collection.key}.${group.key}`,
        label:
          collections.length > 1
            ? `${t(collection.labelKey)} · ${t(group.labelKey)}`
            : t(group.labelKey),
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
    });
  });

  useNavbarSearchBinding({
    query,
    onQueryChange: setQuery,
    placeholder: collections.length === 1 ? t(collections[0].searchKey) : t('pages.searchAll'),
    matched,
    total,
    groups,
    onClearFilters: () => setPrefs(current => ({ ...current, filters: emptyFilters(collections) })),
  });

  const filtering =
    needle !== '' ||
    Object.values(prefs.filters).some(groupsOfCollection =>
      Object.values(groupsOfCollection).some(set => set.size > 0)
    );

  const setSort = (collectionKey, column) =>
    setPrefs(current => ({
      ...current,
      sort: { ...current.sort, [collectionKey]: nextSort(current.sort[collectionKey], column) },
    }));

  const setView = (collectionKey, view) =>
    setPrefs(current => ({ ...current, view: { ...current.view, [collectionKey]: view } }));

  const toggleCollapsed = groupKey =>
    setPrefs(current => ({
      ...current,
      collapsed: { ...current.collapsed, [groupKey]: !current.collapsed[groupKey] },
    }));

  return {
    filtered,
    filtering,
    sort: prefs.sort,
    setSort,
    view: prefs.view,
    setView,
    collapsed: prefs.collapsed,
    toggleCollapsed,
  };
};
