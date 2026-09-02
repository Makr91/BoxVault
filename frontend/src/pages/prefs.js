import { filterGroupsOf } from './itemShape';

const parse = key => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || {};
  } catch {
    return {};
  }
};

export const readPrefs = (key, collections) => {
  const saved = parse(key);
  const filters = {};
  const sort = {};
  const view = {};
  collections.forEach(collection => {
    filters[collection.key] = Object.fromEntries(
      filterGroupsOf(collection).map(group => [
        group.key,
        new Set(saved.filters?.[collection.key]?.[group.key] || []),
      ])
    );
    sort[collection.key] = saved.sort?.[collection.key] || { column: '', direction: 'asc' };
    view[collection.key] = saved.view?.[collection.key] || collection.defaultView;
  });
  return { filters, sort, view, collapsed: saved.collapsed || {} };
};

export const writePrefs = (key, { filters, sort, view, collapsed }) => {
  const plain = Object.fromEntries(
    Object.entries(filters).map(([collectionKey, groups]) => [
      collectionKey,
      Object.fromEntries(Object.entries(groups).map(([groupKey, set]) => [groupKey, [...set]])),
    ])
  );
  localStorage.setItem(key, JSON.stringify({ filters: plain, sort, view, collapsed }));
};

export const emptyFilters = collections =>
  Object.fromEntries(
    collections.map(collection => [
      collection.key,
      Object.fromEntries(filterGroupsOf(collection).map(group => [group.key, new Set()])),
    ])
  );

export const toggleIn = (set, value) => {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};
