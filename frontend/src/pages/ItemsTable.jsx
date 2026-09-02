import PropTypes from 'prop-types';
import { Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaRegStar, FaSort, FaSortDown, FaSortUp, FaStar } from 'react-icons/fa6';

import { collectionShape, itemShape } from './itemShape';

const WatchStar = ({ watched, onToggle }) => {
  const { t } = useTranslation();
  const label = watched ? t('pages.watch.unwatch') : t('pages.watch.watch');
  return (
    <button
      type="button"
      className="btn btn-link btn-sm p-0 text-warning"
      onClick={onToggle}
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
  onToggle: PropTypes.func.isRequired,
};

const SortIcon = ({ column, sort }) => {
  if (sort.column !== column) {
    return <FaSort />;
  }
  return sort.direction === 'asc' ? <FaSortUp /> : <FaSortDown />;
};

SortIcon.propTypes = {
  column: PropTypes.string.isRequired,
  sort: PropTypes.shape({ column: PropTypes.string, direction: PropTypes.string }).isRequired,
};

const ItemsTable = ({ collection, items, sort, onSort, watches, ctx }) => {
  const { t } = useTranslation();
  const columns = collection.columns.filter(column => !column.when || column.when(ctx));
  const { RowActions } = collection.slots;
  const showWatch = Boolean(watches);
  const columnCount = columns.length + (showWatch ? 1 : 0) + (RowActions ? 1 : 0);

  return (
    <Table striped className="table">
      <thead>
        <tr>
          {showWatch ? <th aria-label={t('pages.watch.filterWatched')} /> : null}
          {columns.map(column => (
            <th
              key={column.key}
              className={column.sortValue ? 'sortable-header' : undefined}
              onClick={column.sortValue ? () => onSort(column.key) : undefined}
            >
              {t(column.labelKey)}{' '}
              {column.sortValue ? <SortIcon column={column.key} sort={sort} /> : null}
            </th>
          ))}
          {RowActions ? <th>{t('pages.table.actions')}</th> : null}
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={columnCount} className="text-center">
              {ctx.filtering ? t('pages.noMatches') : t('pages.empty')}
            </td>
          </tr>
        ) : (
          items.map(item => (
            <tr key={item.id}>
              {showWatch ? (
                <td className="text-center align-middle">
                  <WatchStar
                    watched={watches.ids.has(item.id)}
                    onToggle={() => watches.toggle(item)}
                  />
                </td>
              ) : null}
              {columns.map(column => (
                <td key={column.key}>{column.render(item, ctx)}</td>
              ))}
              {RowActions ? (
                <td>
                  <RowActions item={item} ctx={ctx} />
                </td>
              ) : null}
            </tr>
          ))
        )}
      </tbody>
    </Table>
  );
};

ItemsTable.propTypes = {
  collection: collectionShape.isRequired,
  items: PropTypes.arrayOf(itemShape).isRequired,
  sort: PropTypes.shape({ column: PropTypes.string, direction: PropTypes.string }).isRequired,
  onSort: PropTypes.func.isRequired,
  watches: PropTypes.shape({
    ids: PropTypes.instanceOf(Set).isRequired,
    toggle: PropTypes.func.isRequired,
  }),
  ctx: PropTypes.object.isRequired,
};

export default ItemsTable;
