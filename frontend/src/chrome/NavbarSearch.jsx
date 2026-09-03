import PropTypes from 'prop-types';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { FaGear, FaMagnifyingGlass, FaXmark } from 'react-icons/fa6';

const HOVER_DWELL_MS = 400;

const NavbarSearchContext = createContext(null);

export const navbarSearchGroupShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  entries: PropTypes.objectOf(PropTypes.number).isRequired,
  activeSet: PropTypes.instanceOf(Set).isRequired,
  activeClass: PropTypes.string.isRequired,
  onToggle: PropTypes.func.isRequired,
  pillClass: PropTypes.func,
  labelFor: PropTypes.func,
});

export const navbarSearchBindingShape = PropTypes.shape({
  query: PropTypes.string.isRequired,
  onQueryChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string.isRequired,
  matched: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
  groups: PropTypes.arrayOf(navbarSearchGroupShape).isRequired,
  onClearFilters: PropTypes.func.isRequired,
});

const createBindingStore = () => {
  let binding = null;
  let version = 0;
  const listeners = new Set();
  return {
    get: () => binding,
    version: () => version,
    replace: next => {
      binding = next;
    },
    notify: () => {
      version += 1;
      listeners.forEach(listener => listener());
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export const NavbarSearchProvider = ({ children }) => {
  const [store] = useState(createBindingStore);
  const [expanded, setExpanded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const value = useMemo(
    () => ({ store, expanded, setExpanded, panelOpen, setPanelOpen }),
    [store, expanded, panelOpen]
  );
  return <NavbarSearchContext.Provider value={value}>{children}</NavbarSearchContext.Provider>;
};

NavbarSearchProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

const groupSignature = group => [
  group.key,
  group.label,
  Object.entries(group.entries),
  [...group.activeSet],
];

const bindingSignature = binding =>
  JSON.stringify([
    binding.query,
    binding.placeholder,
    binding.matched,
    binding.total,
    binding.groups.map(groupSignature),
  ]);

/**
 * Publishes a page's search and filter state to the navbar for as long as
 * the calling component is mounted. The newest binding is stored on every
 * render, so the navbar's handlers never go stale; the navbar re-renders
 * only when the visible data (query, counts, groups, active values)
 * changes.
 */
export const useNavbarSearchBinding = binding => {
  const context = useContext(NavbarSearchContext);
  const store = context?.store;
  const signature = bindingSignature(binding);

  useEffect(() => {
    store?.replace(binding);
  });

  useEffect(() => {
    store?.notify();
  }, [store, signature]);

  useEffect(
    () => () => {
      store?.replace(null);
      store?.notify();
    },
    [store]
  );
};

const noopSubscribe = () => () => {};
const zero = () => 0;

const useBinding = store => {
  useSyncExternalStore(store ? store.subscribe : noopSubscribe, store ? store.version : zero);
  return store ? store.get() : null;
};

const activeFilterCount = binding =>
  binding.groups.reduce((sum, group) => sum + group.activeSet.size, 0);

const SearchIconButton = ({ filtersOn, onOpen, onMouseEnter, onMouseLeave }) => {
  const { t } = useTranslation();
  return (
    <li className="nav-item">
      <button
        type="button"
        className={`btn btn-link nav-link cluster-btn${filtersOn ? ' filters-on' : ''}`}
        onClick={onOpen}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        title={t('search.open')}
        aria-label={t('search.open')}
      >
        <FaMagnifyingGlass />
      </button>
    </li>
  );
};

SearchIconButton.propTypes = {
  filtersOn: PropTypes.bool.isRequired,
  onOpen: PropTypes.func.isRequired,
  onMouseEnter: PropTypes.func.isRequired,
  onMouseLeave: PropTypes.func.isRequired,
};

const SearchBox = ({ binding, live, panelOpen, onTogglePanel, onClear, onCollapse }) => {
  const { t } = useTranslation();
  const inputRef = useRef(null);
  const filters = activeFilterCount(binding);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = event => {
    if (event.key === 'Escape' && !live().query) {
      onCollapse();
    }
  };

  return (
    <li className="nav-item">
      <div className="navbar-search">
        <FaMagnifyingGlass className="text-body-secondary flex-shrink-0" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={binding.query}
          placeholder={binding.placeholder}
          aria-label={t('search.open')}
          onChange={event => live().onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {binding.total > 0 ? (
          <span className="navbar-search-count">
            {binding.matched} / {binding.total}
          </span>
        ) : null}
        {binding.groups.length > 0 ? (
          <button
            type="button"
            className={`navbar-search-tool${panelOpen || filters > 0 ? ' on' : ''}`}
            onClick={onTogglePanel}
            title={t('search.filters')}
            aria-label={t('search.filters')}
            aria-pressed={panelOpen}
          >
            <FaGear />
          </button>
        ) : null}
        <button
          type="button"
          className="navbar-search-tool"
          onClick={onClear}
          title={t('search.clear')}
          aria-label={t('search.clear')}
        >
          <FaXmark />
        </button>
      </div>
    </li>
  );
};

SearchBox.propTypes = {
  binding: navbarSearchBindingShape.isRequired,
  live: PropTypes.func.isRequired,
  panelOpen: PropTypes.bool.isRequired,
  onTogglePanel: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  onCollapse: PropTypes.func.isRequired,
};

export const NavbarSearchControl = () => {
  const context = useContext(NavbarSearchContext);
  const binding = useBinding(context?.store);
  const dwell = useRef(null);

  useEffect(() => () => clearTimeout(dwell.current), []);

  if (!context || !binding) {
    return null;
  }

  const { store, expanded, setExpanded, panelOpen, setPanelOpen } = context;
  const live = () => store.get() || binding;

  const collapse = () => {
    setPanelOpen(false);
    setExpanded(false);
  };

  const clearAll = () => {
    const current = live();
    current.onQueryChange('');
    current.onClearFilters();
    collapse();
  };

  const startDwell = () => {
    clearTimeout(dwell.current);
    dwell.current = setTimeout(() => setExpanded(true), HOVER_DWELL_MS);
  };

  const stopDwell = () => clearTimeout(dwell.current);

  if (!expanded) {
    return (
      <SearchIconButton
        filtersOn={activeFilterCount(binding) > 0}
        onOpen={() => setExpanded(true)}
        onMouseEnter={startDwell}
        onMouseLeave={stopDwell}
      />
    );
  }

  return (
    <SearchBox
      binding={binding}
      live={live}
      panelOpen={panelOpen}
      onTogglePanel={() => setPanelOpen(open => !open)}
      onClear={clearAll}
      onCollapse={collapse}
    />
  );
};

const FilterPill = ({ count, active, activeClass, label, onToggle }) => (
  <span
    className={`badge rounded-pill badge-xs cursor-pointer ${
      active ? activeClass : 'bg-secondary bg-opacity-25'
    }`}
    onClick={onToggle}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle();
      }
    }}
    role="button"
    tabIndex={0}
  >
    {label} ({count})
  </span>
);

FilterPill.propTypes = {
  count: PropTypes.number.isRequired,
  active: PropTypes.bool.isRequired,
  activeClass: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  onToggle: PropTypes.func.isRequired,
};

const FilterGroup = ({ group }) => (
  <div className="navbar-search-group">
    <span className="navbar-search-group-label">{group.label}</span>
    <span className="navbar-search-pills">
      {Object.entries(group.entries).map(([value, count]) => (
        <FilterPill
          key={value}
          count={count}
          active={group.activeSet.has(value)}
          activeClass={group.pillClass ? group.pillClass(value) : group.activeClass}
          label={group.labelFor ? group.labelFor(value) : value}
          onToggle={() => group.onToggle(value)}
        />
      ))}
    </span>
  </div>
);

FilterGroup.propTypes = {
  group: navbarSearchGroupShape.isRequired,
};

export const NavbarSearchPanel = () => {
  const { t } = useTranslation();
  const context = useContext(NavbarSearchContext);
  const binding = useBinding(context?.store);

  if (!context || !binding || !context.panelOpen || binding.groups.length === 0) {
    return null;
  }

  return (
    <div className="navbar-search-panel w-100">
      {binding.groups.map(group => (
        <FilterGroup key={group.key} group={group} />
      ))}
      <div className="navbar-search-foot">
        <span>{t('search.activeFilters', { count: activeFilterCount(binding) })}</span>
        <span className="flex-grow-1" />
        <button
          type="button"
          className="btn btn-link btn-sm p-0"
          onClick={() => (context.store.get() || binding).onClearFilters()}
        >
          {t('search.clearFilters')}
        </button>
      </div>
    </div>
  );
};
