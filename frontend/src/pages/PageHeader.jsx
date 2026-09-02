import PropTypes from 'prop-types';

const PageHeader = ({ media, title, subtitle, chips, actions, children }) => (
  <div className="mb-4 d-flex justify-content-between align-items-start gap-3 flex-wrap">
    <div className="d-flex align-items-start gap-3 flex-wrap flex-grow-1 min-width-0">
      {media}
      <div className="flex-grow-1 min-width-0">
        <h3 className="mb-1">{title}</h3>
        {subtitle ? <div className="text-muted small">{subtitle}</div> : null}
        {chips ? <div className="d-flex gap-2 flex-wrap mt-2">{chips}</div> : null}
        {children}
      </div>
    </div>
    {actions ? <div className="d-flex flex-wrap justify-content-end gap-2">{actions}</div> : null}
  </div>
);

PageHeader.propTypes = {
  media: PropTypes.node,
  title: PropTypes.node.isRequired,
  subtitle: PropTypes.string,
  chips: PropTypes.node,
  actions: PropTypes.node,
  children: PropTypes.node,
};

export default PageHeader;
