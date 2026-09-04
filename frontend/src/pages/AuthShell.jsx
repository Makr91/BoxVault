import PropTypes from 'prop-types';

const ALERT_ICONS = {
  danger: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 4.5v4M8 11h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  success: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="m5 8 2 2 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7.5v4M8 5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

export const AuthAlert = ({ tone, children }) => (
  <div className={`auth-alert auth-alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
    {ALERT_ICONS[tone]}
    <div>{children}</div>
  </div>
);

AuthAlert.propTypes = {
  tone: PropTypes.oneOf(['danger', 'success', 'info']).isRequired,
  children: PropTypes.node.isRequired,
};

export const InboxIcon = () => (
  <div className="auth-icon-circle success" aria-hidden="true">
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="m4 7 8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

export const AuthSpinner = ({ label }) => (
  <div className="auth-spinner" role="status">
    <span className="visually-hidden">{label}</span>
  </div>
);

AuthSpinner.propTypes = {
  label: PropTypes.string.isRequired,
};

/**
 * The centered column every auth page draws in: an optional icon, the
 * headline, an optional subhead and the page's own content beneath.
 */
const AuthShell = ({ title, subtitle, icon, children }) => (
  <div className="auth-page">
    <div className="auth-column">
      <div className="auth-heading">
        {icon}
        <h1 className="auth-headline">{title}</h1>
        {subtitle && <p className="auth-subhead">{subtitle}</p>}
      </div>
      {children}
    </div>
  </div>
);

AuthShell.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  icon: PropTypes.node,
  children: PropTypes.node,
};

export default AuthShell;
