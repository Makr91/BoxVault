import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

const BoxPageHeader = ({ crumbs, actions, media, title, subtitle, chips, children }) => (
  <div className="mb-4">
    <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
      <nav aria-label="breadcrumb" className="align-self-center">
        {crumbs.map((crumb, index) => (
          <span key={crumb.label}>
            {index > 0 && <span className="text-muted mx-1">/</span>}
            {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <strong>{crumb.label}</strong>}
          </span>
        ))}
      </nav>
      {actions && <div className="d-flex flex-wrap align-items-center">{actions}</div>}
    </div>
    {(media || title) && (
      <div className="d-flex align-items-start gap-3 flex-wrap">
        {media}
        <div className="flex-grow-1">
          {title && <h3 className="mb-1">{title}</h3>}
          {subtitle && <div className="text-muted small">{subtitle}</div>}
          {chips && <div className="d-flex gap-2 flex-wrap mt-2">{chips}</div>}
          {children}
        </div>
      </div>
    )}
  </div>
);

BoxPageHeader.propTypes = {
  crumbs: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      to: PropTypes.string,
    })
  ).isRequired,
  actions: PropTypes.node,
  media: PropTypes.node,
  title: PropTypes.node,
  subtitle: PropTypes.string,
  chips: PropTypes.node,
  children: PropTypes.node,
};

export default BoxPageHeader;
