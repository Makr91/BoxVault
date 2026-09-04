import PropTypes from 'prop-types';
import { Table } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaRegStar, FaSort, FaSortDown, FaSortUp, FaStar } from 'react-icons/fa6';

import GroupHeading, { groupShape } from './GroupHeading';
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

const SortButton = ({ onClick, children }) => (
  <button
    type="button"
    className="btn btn-link btn-sm p-0 fw-bold text-body text-decoration-none text-nowrap"
    onClick={onClick}
  >
    {children}
  </button>
);

SortButton.propTypes = {
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

const ItemRow = ({ item, columns, watches, ItemQuickActions, RowActions, ctx }) => (
  <tr>
    <td className="col-watch text-center align-middle">
      {watches ? (
        <WatchStar watched={watches.ids.has(item.id)} onToggle={() => watches.toggle(item)} />
      ) : null}
    </td>
    {columns.map(column => (
      <td key={column.key} className={`col-${column.key}`}>
        {column.render(item, ctx)}
      </td>
    ))}
    {ItemQuickActions ? (
      <td className="col-quick text-center align-middle">
        <ItemQuickActions item={item} ctx={ctx} />
      </td>
    ) : null}
    {RowActions ? (
      <td className="col-actions">
        <RowActions item={item} ctx={ctx} />
      </td>
    ) : null}
  </tr>
);

ItemRow.propTypes = {
  item: itemShape.isRequired,
  columns: PropTypes.array.isRequired,
  watches: PropTypes.object,
  ItemQuickActions: PropTypes.elementType,
  RowActions: PropTypes.elementType,
  ctx: PropTypes.object.isRequired,
};

const ItemsTable = ({
  collection,
  items,
  groups,
  collapsed,
  onToggleGroup,
  sort,
  onSort,
  watches,
  hiddenColumns,
  ctx,
}) => {
  const { t } = useTranslation();
  const columns = collection.columns.filter(
    column => !hiddenColumns.has(column.key) && (!column.when || column.when(ctx))
  );
  const { ItemQuickActions, RowActions } = collection.slots;
  const columnCount = columns.length + 1 + (ItemQuickActions ? 1 : 0) + (RowActions ? 1 : 0);
  const rowProps = { columns, watches, ItemQuickActions, RowActions, ctx };

  const body = () => {
    if (items.length === 0) {
      return (
        <tbody>
          <tr>
            <td colSpan={columnCount} className="text-center">
              {ctx.filtering ? t('pages.noMatches') : t('pages.empty')}
            </td>
          </tr>
        </tbody>
      );
    }
    if (!groups) {
      return (
        <tbody>
          {items.map(item => (
            <ItemRow key={item.id} item={item} {...rowProps} />
          ))}
        </tbody>
      );
    }
    return groups.map(group => (
      <tbody key={group.key}>
        <tr className="table-group-row">
          <td colSpan={columnCount}>
            <GroupHeading
              group={group}
              collapsed={Boolean(collapsed[group.key])}
              onToggle={() => onToggleGroup(group.key)}
              countLabel={t(collection.countKey, { count: group.items.length })}
              orgMark={ctx.orgMark}
            />
          </td>
        </tr>
        {collapsed[group.key]
          ? null
          : group.items.map(item => <ItemRow key={item.id} item={item} {...rowProps} />)}
      </tbody>
    ));
  };

  return (
    <Table striped className="table items-table">
      <thead>
        <tr>
          <th className="col-watch text-center" title={t('pages.watch.filterWatched')}>
            {watches ? (
              <SortButton onClick={() => onSort('watch')}>
                <FaRegStar aria-label={t('pages.watch.filterWatched')} />{' '}
                <SortIcon column="watch" sort={sort} />
              </SortButton>
            ) : (
              <FaRegStar aria-label={t('pages.watch.filterWatched')} />
            )}
          </th>
          {columns.map(column => (
            <th key={column.key} className={`col-${column.key}`}>
              {column.sortValue ? (
                <SortButton onClick={() => onSort(column.key)}>
                  {t(column.labelKey)} <SortIcon column={column.key} sort={sort} />
                </SortButton>
              ) : (
                t(column.labelKey)
              )}
            </th>
          ))}
          {ItemQuickActions ? (
            <th className="col-quick" aria-label={t('pages.table.actions')} />
          ) : null}
          {RowActions ? <th className="col-actions">{t('pages.table.actions')}</th> : null}
        </tr>
      </thead>
      {body()}
    </Table>
  );
};

ItemsTable.propTypes = {
  collection: collectionShape.isRequired,
  items: PropTypes.arrayOf(itemShape).isRequired,
  groups: PropTypes.arrayOf(groupShape),
  collapsed: PropTypes.object.isRequired,
  onToggleGroup: PropTypes.func.isRequired,
  sort: PropTypes.shape({ column: PropTypes.string, direction: PropTypes.string }).isRequired,
  onSort: PropTypes.func.isRequired,
  watches: PropTypes.shape({
    ids: PropTypes.instanceOf(Set).isRequired,
    toggle: PropTypes.func.isRequired,
  }),
  hiddenColumns: PropTypes.instanceOf(Set).isRequired,
  ctx: PropTypes.object.isRequired,
};

export default ItemsTable;
