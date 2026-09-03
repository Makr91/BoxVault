import { filterGroupsOf } from './itemShape';

const VIEWS = ['table', 'cards'];

const parse = key => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') || {};
  } catch {
    return {};
  }
};

const setOf = values => new Set(Array.isArray(values) ? values : []);

const defaultHidden = collection =>
  collection.columns.filter(column => column.defaultHidden).map(column => column.key);

const plainSets = sets =>
  Object.fromEntries(Object.entries(sets).map(([key, set]) => [key, [...set]]));

export const readPrefs = (key, collections) => {
  const saved = parse(key);
  const filters = {};
  const sort = {};
  const hiddenColumns = {};
  collections.forEach(collection => {
    filters[collection.key] = Object.fromEntries(
      filterGroupsOf(collection).map(group => [
        group.key,
        setOf(saved.filters?.[collection.key]?.[group.key]),
      ])
    );
    sort[collection.key] = saved.sort?.[collection.key] || { column: '', direction: 'asc' };
    hiddenColumns[collection.key] = setOf(
      saved.hiddenColumns?.[collection.key] ?? defaultHidden(collection)
    );
  });
  return {
    filters,
    collection: setOf(saved.collection),
    visibility: setOf(saved.visibility),
    watched: setOf(saved.watched),
    sort,
    view: VIEWS.includes(saved.view) ? saved.view : collections[0].defaultView,
    collapsed: saved.collapsed || {},
    hiddenColumns,
  };
};

export const writePrefs = (
  key,
  { filters, collection, visibility, watched, sort, view, collapsed, hiddenColumns }
) => {
  localStorage.setItem(
    key,
    JSON.stringify({
      filters: Object.fromEntries(
        Object.entries(filters).map(([collectionKey, groups]) => [collectionKey, plainSets(groups)])
      ),
      collection: [...collection],
      visibility: [...visibility],
      watched: [...watched],
      sort,
      view,
      collapsed,
      hiddenColumns: plainSets(hiddenColumns),
    })
  );
};

export const emptyFilters = collections => ({
  filters: Object.fromEntries(
    collections.map(collection => [
      collection.key,
      Object.fromEntries(filterGroupsOf(collection).map(group => [group.key, new Set()])),
    ])
  ),
  collection: new Set(),
  visibility: new Set(),
  watched: new Set(),
});

export const toggleIn = (set, value) => {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};
