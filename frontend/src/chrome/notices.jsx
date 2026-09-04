import PropTypes from 'prop-types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { CloseButton, Toast, ToastContainer } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaCircleCheck, FaCircleInfo, FaCircleXmark, FaTriangleExclamation } from 'react-icons/fa6';

const CARD_CAP = 4;
const AUTO_HIDE_MS = 6000;
const AUTO_HIDE_KINDS = ['success', 'info'];
const ALERT_KINDS = ['warning', 'danger'];
const KIND_ICONS = {
  success: FaCircleCheck,
  info: FaCircleInfo,
  warning: FaTriangleExclamation,
  danger: FaCircleXmark,
};

const NoticeContext = createContext(null);

const roleOf = kind => (ALERT_KINDS.includes(kind) ? 'alert' : 'status');

const createNoticeStore = () => {
  let notices = [];
  let nextId = 0;
  const listeners = new Set();

  const set = next => {
    notices = next;
    listeners.forEach(listener => listener());
  };

  const drop = keep => {
    const next = notices.filter(keep);
    if (next.length !== notices.length) {
      set(next);
    }
  };

  const add = notice => {
    nextId += 1;
    const entry = { ...notice, id: nextId };
    const kept = notice.key ? notices.filter(other => other.key !== notice.key) : notices;
    const next = [entry, ...kept];
    const overflow = next.filter(other => other.tier === 'card').slice(CARD_CAP);
    set(overflow.length > 0 ? next.filter(other => !overflow.includes(other)) : next);
    return entry.id;
  };

  return {
    get: () => notices,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    add,
    remove: id => drop(notice => notice.id !== id),
    removeKey: key => drop(notice => notice.key !== key),
  };
};

const createNotifier =
  store =>
  (kind, text, options = {}) => {
    const { tier = 'card', key = '', sticky = false, action = null } = options;
    if (!text) {
      if (key) {
        store.removeKey(key);
      }
      return 0;
    }
    return store.add({ kind, text, tier, key, sticky, action });
  };

/**
 * Holds the notices every estate app raises, outside the routes so they
 * survive route changes and page crashes; `mountApp` renders it inside the
 * outer error boundary.
 */
export const NoticeProvider = ({ children }) => {
  const [store] = useState(createNoticeStore);
  const value = useMemo(
    () => ({ store, notify: createNotifier(store), dismiss: store.remove }),
    [store]
  );
  return <NoticeContext.Provider value={value}>{children}</NoticeContext.Provider>;
};

NoticeProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

/**
 * The one way pages and slots raise an in-app notice: `notify(kind, text,
 * options)` with kind `success`, `info`, `warning` or `danger`, a card unless
 * `options.tier` is `banner`; `options.key` replaces an earlier notice with
 * the same key and, with an empty `text`, dismisses it; `options.sticky`
 * keeps a success or info card until it is dismissed; `options.action` is
 * `{ label, onClick | to | href }`. Returns the notice id.
 *
 * @returns {Function} The app's `notify`
 */
export const useNotify = () => useContext(NoticeContext).notify;

/**
 * Dismisses one notice by the id `notify` returned.
 *
 * @returns {Function} `dismiss(id)`
 */
export const useDismiss = () => useContext(NoticeContext).dismiss;

const useNoticeList = () => {
  const { store } = useContext(NoticeContext);
  return useSyncExternalStore(store.subscribe, store.get);
};

const actionShape = PropTypes.shape({
  label: PropTypes.string.isRequired,
  onClick: PropTypes.func,
  to: PropTypes.string,
  href: PropTypes.string,
});

const noticeShape = PropTypes.shape({
  id: PropTypes.number.isRequired,
  kind: PropTypes.oneOf(['success', 'info', 'warning', 'danger']).isRequired,
  text: PropTypes.node.isRequired,
  tier: PropTypes.oneOf(['card', 'banner']).isRequired,
  key: PropTypes.string.isRequired,
  sticky: PropTypes.bool.isRequired,
  action: actionShape,
});

const NoticeAction = ({ action, LinkComponent }) => {
  const className = 'btn btn-sm btn-outline-secondary text-nowrap';
  if (action.to) {
    return (
      <LinkComponent to={action.to} className={className}>
        {action.label}
      </LinkComponent>
    );
  }
  if (action.href) {
    return (
      <a href={action.href} className={className}>
        {action.label}
      </a>
    );
  }
  return (
    <button type="button" className={className} onClick={action.onClick}>
      {action.label}
    </button>
  );
};

NoticeAction.propTypes = {
  action: actionShape.isRequired,
  LinkComponent: PropTypes.elementType.isRequired,
};

const Banner = ({ notice, onDismiss, LinkComponent }) => {
  const { t } = useTranslation();
  const Icon = KIND_ICONS[notice.kind];
  return (
    <div className={`notice-banner notice-banner-${notice.kind} w-100`} role={roleOf(notice.kind)}>
      <Icon className="flex-shrink-0" aria-hidden />
      <span className="flex-grow-1">{notice.text}</span>
      {notice.action ? <NoticeAction action={notice.action} LinkComponent={LinkComponent} /> : null}
      <CloseButton onClick={() => onDismiss(notice.id)} aria-label={t('notice.dismiss')} />
    </div>
  );
};

Banner.propTypes = {
  notice: noticeShape.isRequired,
  onDismiss: PropTypes.func.isRequired,
  LinkComponent: PropTypes.elementType.isRequired,
};

/**
 * The band under the header row: every banner-tier notice, newest first,
 * each with its kind icon, text, optional action and a dismiss button.
 */
export const NoticeBanners = ({ LinkComponent = 'a' }) => {
  const { dismiss } = useContext(NoticeContext);
  return useNoticeList()
    .filter(notice => notice.tier === 'banner')
    .map(notice => (
      <Banner key={notice.id} notice={notice} onDismiss={dismiss} LinkComponent={LinkComponent} />
    ));
};

NoticeBanners.propTypes = {
  LinkComponent: PropTypes.elementType,
};

const NoticeCard = ({ notice, onDismiss, LinkComponent }) => {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const remaining = useRef(AUTO_HIDE_MS);
  const autoHide = !notice.sticky && AUTO_HIDE_KINDS.includes(notice.kind);
  const dismiss = useCallback(() => onDismiss(notice.id), [onDismiss, notice.id]);

  useEffect(() => {
    if (!autoHide || paused) {
      return undefined;
    }
    const started = Date.now();
    const timer = setTimeout(dismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [autoHide, paused, dismiss]);

  const Icon = KIND_ICONS[notice.kind];
  return (
    <Toast
      className={`notice-card notice-card-${notice.kind}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Toast.Body className="d-flex align-items-start gap-2">
        <Icon className={`text-${notice.kind} flex-shrink-0 mt-1`} aria-hidden />
        <span className="flex-grow-1">{notice.text}</span>
        {notice.action ? (
          <NoticeAction action={notice.action} LinkComponent={LinkComponent} />
        ) : null}
        <CloseButton onClick={dismiss} aria-label={t('notice.dismiss')} />
      </Toast.Body>
    </Toast>
  );
};

NoticeCard.propTypes = {
  notice: noticeShape.isRequired,
  onDismiss: PropTypes.func.isRequired,
  LinkComponent: PropTypes.elementType.isRequired,
};

/**
 * The in-app notice cards at the top right under the header: the four
 * newest card-tier notices, success and info gone after six seconds unless
 * the pointer or focus rests on them, warning and danger until dismissed.
 */
export const NoticeCards = ({ LinkComponent = 'a' }) => {
  const { dismiss } = useContext(NoticeContext);
  const cards = useNoticeList().filter(notice => notice.tier === 'card');
  return (
    <ToastContainer position="top-end" containerPosition="fixed" className="notice-cards">
      {cards.map(notice => (
        <NoticeCard
          key={notice.id}
          notice={notice}
          onDismiss={dismiss}
          LinkComponent={LinkComponent}
        />
      ))}
    </ToastContainer>
  );
};

NoticeCards.propTypes = {
  LinkComponent: PropTypes.elementType,
};
