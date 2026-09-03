import PropTypes from 'prop-types';
import { Card, Col, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaBug, FaGears, FaGithub, FaHouse, FaRegStar, FaStar } from 'react-icons/fa6';
import { Link } from 'react-router-dom';

import { OrgLogo, itemPath } from '../chrome';

import GroupHeading, { groupShape } from './GroupHeading';
import { collectionShape, itemShape, statusOf, visibilityOf } from './itemShape';
import StatusChips from './StatusChips';

const CardMedia = ({ item, ctx }) => {
  if (item.artwork || item.icon) {
    return (
      <img
        src={item.artwork || item.icon}
        alt=""
        className="prov-icon"
        loading="lazy"
        onError={event => {
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  }
  return (
    <OrgLogo
      org={item.organization}
      size={40}
      className="rounded-circle org-logo-lg"
      fallback={ctx.orgMark}
    />
  );
};

CardMedia.propTypes = {
  item: itemShape.isRequired,
  ctx: PropTypes.object.isRequired,
};

const LINKS = [
  { key: 'repo', Icon: FaGithub, labelKey: 'pages.links.repo' },
  { key: 'homepage', Icon: FaHouse, labelKey: 'pages.links.homepage' },
  { key: 'issues', Icon: FaBug, labelKey: 'pages.links.issues' },
  { key: 'pipeline', Icon: FaGears, labelKey: 'pages.links.pipeline' },
];

const CardLinks = ({ item, ItemQuickActions, ctx }) => {
  const { t } = useTranslation();
  const links = item.links || {};
  const present = LINKS.filter(link => links[link.key]);
  if (present.length === 0 && !ItemQuickActions) {
    return null;
  }
  return (
    <div className="d-flex align-items-center gap-3 card-links">
      {present.map(({ key, Icon, labelKey }) => (
        <a
          key={key}
          href={links[key]}
          target="_blank"
          rel="noreferrer"
          className="text-body-secondary"
          title={t(labelKey)}
          aria-label={t(labelKey)}
        >
          <Icon />
        </a>
      ))}
      {ItemQuickActions ? (
        <span className="ms-auto d-inline-flex align-items-center gap-3">
          <ItemQuickActions item={item} ctx={ctx} />
        </span>
      ) : null}
    </div>
  );
};

CardLinks.propTypes = {
  item: itemShape.isRequired,
  ItemQuickActions: PropTypes.elementType,
  ctx: PropTypes.object.isRequired,
};

const ItemCard = ({ collection, item, watches, ctx }) => {
  const { t } = useTranslation();
  const { ItemChips, ItemQuickActions, CardExtras, RowActions } = collection.slots;
  const title = item.label || item.name;
  const watched = watches ? watches.ids.has(item.id) : false;
  return (
    <Card className="h-100 shadow-sm catalog-card">
      <Card.Body className="d-flex flex-column">
        <div className="d-flex align-items-start gap-2 mb-2">
          <CardMedia item={item} ctx={ctx} />
          <div className="flex-grow-1 min-width-0">
            <Card.Title className="mb-0 text-break">
              {collection.itemRoute ? (
                <Link to={itemPath(collection, item.organization.name, item.name)}>{title}</Link>
              ) : (
                title
              )}
            </Card.Title>
            <div className="small text-body-secondary">{item.organization.name}</div>
            {item.label && item.label !== item.name ? (
              <code className="checksum">{item.name}</code>
            ) : null}
          </div>
          {watches ? (
            <button
              type="button"
              className="btn btn-link p-0 text-warning"
              onClick={() => watches.toggle(item)}
              title={watched ? t('pages.watch.unwatch') : t('pages.watch.watch')}
              aria-pressed={watched}
            >
              {watched ? <FaStar /> : <FaRegStar />}
            </button>
          ) : null}
        </div>
        <div className="d-flex flex-wrap gap-1 mb-2">
          <StatusChips
            status={statusOf(item)}
            visibility={visibilityOf(item)}
            osLabel={item.os?.label || null}
          />
          {ItemChips ? <ItemChips item={item} ctx={ctx} /> : null}
        </div>
        {item.description ? (
          <Card.Text className="card-desc" title={item.description}>
            {item.description}
          </Card.Text>
        ) : null}
        <div className="mt-auto d-flex flex-column gap-2">
          <CardLinks item={item} ItemQuickActions={ItemQuickActions} ctx={ctx} />
          {CardExtras ? <CardExtras item={item} ctx={ctx} /> : null}
          {RowActions ? <RowActions item={item} ctx={ctx} /> : null}
        </div>
      </Card.Body>
    </Card>
  );
};

ItemCard.propTypes = {
  collection: collectionShape.isRequired,
  item: itemShape.isRequired,
  watches: PropTypes.shape({
    ids: PropTypes.instanceOf(Set).isRequired,
    toggle: PropTypes.func.isRequired,
  }),
  ctx: PropTypes.object.isRequired,
};

const CardGrid = ({ collection, items, watches, ctx }) => (
  <Row xs={1} md={2} xl={3} className="g-3 mb-3">
    {items.map(item => (
      <Col key={item.id}>
        <ItemCard collection={collection} item={item} watches={watches} ctx={ctx} />
      </Col>
    ))}
  </Row>
);

CardGrid.propTypes = {
  collection: collectionShape.isRequired,
  items: PropTypes.arrayOf(itemShape).isRequired,
  watches: PropTypes.object,
  ctx: PropTypes.object.isRequired,
};

const ItemCards = ({ collection, items, groups, collapsed, onToggleGroup, watches, ctx }) => {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <div className="alert alert-secondary">
        {ctx.filtering ? t('pages.noMatches') : t('pages.empty')}
      </div>
    );
  }
  if (!groups) {
    return <CardGrid collection={collection} items={items} watches={watches} ctx={ctx} />;
  }
  return groups.map(group => (
    <div key={group.key} className="mb-3">
      <div className="mb-2">
        <GroupHeading
          group={group}
          collapsed={Boolean(collapsed[group.key])}
          onToggle={() => onToggleGroup(group.key)}
          countLabel={t(collection.countKey, { count: group.items.length })}
          orgMark={ctx.orgMark}
        />
      </div>
      {collapsed[group.key] ? null : (
        <CardGrid collection={collection} items={group.items} watches={watches} ctx={ctx} />
      )}
    </div>
  ));
};

ItemCards.propTypes = {
  collection: collectionShape.isRequired,
  items: PropTypes.arrayOf(itemShape).isRequired,
  groups: PropTypes.arrayOf(groupShape),
  collapsed: PropTypes.object.isRequired,
  onToggleGroup: PropTypes.func.isRequired,
  watches: PropTypes.shape({
    ids: PropTypes.instanceOf(Set).isRequired,
    toggle: PropTypes.func.isRequired,
  }),
  ctx: PropTypes.object.isRequired,
};

export default ItemCards;
