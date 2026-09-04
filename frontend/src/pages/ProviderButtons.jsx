import PropTypes from 'prop-types';

const hideBrokenIcon = event => {
  event.target.style.display = 'none';
};

const ProviderButtons = ({
  methods,
  defaultProvider,
  loading,
  loadingProvider = null,
  onSelect,
}) => (
  <div className="auth-form">
    {methods.map(method => {
      const providerName = method.id.replace('oidc-', '');
      const isPrimary = methods.length === 1 || method.id === `oidc-${defaultProvider}`;
      const variant = isPrimary ? 'auth-btn-primary' : 'auth-btn-secondary';
      const busy = loadingProvider === providerName;
      return (
        <button
          key={method.id}
          type="button"
          className={`auth-btn auth-btn-block ${variant}${busy ? ' is-loading' : ''}`}
          disabled={loading || Boolean(loadingProvider)}
          onClick={() => onSelect(providerName)}
        >
          {method.icon_url && (
            <img
              src={method.icon_url}
              className="auth-provider-icon"
              alt=""
              onError={hideBrokenIcon}
            />
          )}
          <span>{method.name}</span>
        </button>
      );
    })}
  </div>
);

ProviderButtons.propTypes = {
  methods: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      icon_url: PropTypes.string,
    })
  ).isRequired,
  defaultProvider: PropTypes.string,
  loading: PropTypes.bool.isRequired,
  loadingProvider: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
};

export default ProviderButtons;
