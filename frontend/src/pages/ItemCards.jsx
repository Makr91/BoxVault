import PropTypes from 'prop-types';
import { Card, Col, Row } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { FaRegStar, FaStar } from 'react-icons/fa6';
import { Link } from 'react-router-dom';

import { OrgLogo, itemPath } from '../chrome';

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

const ItemCard = ({ collection, item, watches, ctx }) => {
  const { t } = useTranslation();
  const { ItemChips, CardExtras, RowActions } = collection.slots;
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

const ItemCards = ({ collection, items, watches, ctx }) => {
  const { t } = useTranslation();
  if (items.length === 0) {
    return (
      <div className="alert alert-secondary">
        {ctx.filtering ? t('pages.noMatches') : t('pages.empty')}
      </div>
    );
  }
  return (
    <Row xs={1} md={2} xl={3} className="g-3 mb-3">
      {items.map(item => (
        <Col key={item.id}>
          <ItemCard collection={collection} item={item} watches={watches} ctx={ctx} />
        </Col>
      ))}
    </Row>
  );
};

ItemCards.propTypes = {
  collection: collectionShape.isRequired,
  items: PropTypes.arrayOf(itemShape).isRequired,
  watches: PropTypes.shape({
    ids: PropTypes.instanceOf(Set).isRequired,
    toggle: PropTypes.func.isRequired,
  }),
  ctx: PropTypes.object.isRequired,
};

export default ItemCards;
