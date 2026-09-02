import PropTypes from 'prop-types';
import { Fragment } from 'react';
import { Dropdown } from 'react-bootstrap';

const CRUMB_CLASS = 'nav-link py-0 px-2 d-inline-flex align-items-center gap-2 crumb';

export const crumbShape = PropTypes.shape({
  key: PropTypes.string.isRequired,
  label: PropTypes.node.isRequired,
  icon: PropTypes.node,
  href: PropTypes.string,
  to: PropTypes.string,
  onClick: PropTypes.func,
  picker: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.node.isRequired,
      icon: PropTypes.node,
      hint: PropTypes.node,
      active: PropTypes.bool,
      disabled: PropTypes.bool,
      onPick: PropTypes.func.isRequired,
    })
  ),
});

const Separator = () => (
  <li className="nav-item crumb-sep" aria-hidden>
    ›
  </li>
);

const CrumbLink = ({ crumb, LinkComponent }) => {
  if (crumb.to) {
    return (
      <LinkComponent to={crumb.to} className={CRUMB_CLASS}>
        {crumb.icon}
        {crumb.label}
      </LinkComponent>
    );
  }
  if (crumb.href) {
    return (
      <a href={crumb.href} className={CRUMB_CLASS}>
        {crumb.icon}
        {crumb.label}
      </a>
    );
  }
  return (
    <button type="button" className={CRUMB_CLASS} onClick={crumb.onClick}>
      {crumb.icon}
      {crumb.label}
    </button>
  );
};

CrumbLink.propTypes = {
  crumb: crumbShape.isRequired,
  LinkComponent: PropTypes.elementType.isRequired,
};

const CrumbPicker = ({ crumb }) => (
  <Dropdown as="li" className="nav-item">
    <Dropdown.Toggle
      as="button"
      type="button"
      bsPrefix="nav-link"
      className={`${CRUMB_CLASS} dropdown-toggle`}
    >
      {crumb.icon}
      {crumb.label}
    </Dropdown.Toggle>
    <Dropdown.Menu>
      {crumb.picker.map(item => (
        <Dropdown.Item
          key={item.key}
          as="button"
          type="button"
          active={Boolean(item.active)}
          disabled={Boolean(item.disabled)}
          onClick={item.onPick}
        >
          {item.icon}
          {item.label}
          {item.hint ? <small className="ms-2 text-body-secondary">{item.hint}</small> : null}
        </Dropdown.Item>
      ))}
    </Dropdown.Menu>
  </Dropdown>
);

CrumbPicker.propTypes = {
  crumb: crumbShape.isRequired,
};

const Crumbs = ({ crumbs, LinkComponent = 'a' }) =>
  crumbs.map(crumb => (
    <Fragment key={crumb.key}>
      <Separator />
      {crumb.picker ? (
        <CrumbPicker crumb={crumb} />
      ) : (
        <li className="nav-item">
          <CrumbLink crumb={crumb} LinkComponent={LinkComponent} />
        </li>
      )}
    </Fragment>
  ));

Crumbs.propTypes = {
  crumbs: PropTypes.arrayOf(crumbShape).isRequired,
  LinkComponent: PropTypes.elementType,
};

export default Crumbs;
