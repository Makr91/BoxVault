import PropTypes from 'prop-types';
import { Component } from 'react';
import { useTranslation } from 'react-i18next';
import { FaArrowsRotate, FaHouse, FaTriangleExclamation } from 'react-icons/fa6';

const Fallback = ({ error, errorInfo, showErrorDetails }) => {
  const { t } = useTranslation();
  return (
    <div className="container-fluid py-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="card border-danger">
            <div className="card-body text-center">
              <FaTriangleExclamation className="display-4 text-danger mb-3" aria-hidden />
              <h4 className="mb-3">{t('error.somethingWentWrong')}</h4>
              <p className="text-body-secondary mb-4">{t('error.unexpectedErrorOccurred')}</p>
              <div className="d-flex gap-2 justify-content-center">
                <button
                  type="button"
                  className="btn btn-outline-primary d-inline-flex align-items-center gap-2"
                  onClick={() => window.location.reload()}
                >
                  <FaArrowsRotate aria-hidden />
                  {t('error.refreshPage')}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                  onClick={() => window.location.assign('/')}
                >
                  <FaHouse aria-hidden />
                  {t('error.goHome')}
                </button>
              </div>
              {showErrorDetails && error ? (
                <details className="mt-4">
                  <summary className="text-body-secondary small">
                    {t('error.errorDetailsDevelopment')}
                  </summary>
                  <pre className="text-start text-danger small mt-2">
                    {error.toString()}
                    {errorInfo?.componentStack}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

Fallback.propTypes = {
  error: PropTypes.object,
  errorInfo: PropTypes.object,
  showErrorDetails: PropTypes.bool.isRequired,
};

class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <Fallback
        error={this.state.error}
        errorInfo={this.state.errorInfo}
        showErrorDetails={this.props.showErrorDetails}
      />
    );
  }
}

Boundary.propTypes = {
  children: PropTypes.node.isRequired,
  showErrorDetails: PropTypes.bool.isRequired,
  onError: PropTypes.func,
};

/**
 * Catches a render error anywhere under it and draws the shared fallback
 * card, refresh and home, with the stack behind a details fold when
 * `showErrorDetails` is on; `onError` lets an app log the error its own way.
 */
const ErrorBoundary = ({ children, showErrorDetails = false, onError = null }) => (
  <Boundary showErrorDetails={showErrorDetails} onError={onError}>
    {children}
  </Boundary>
);

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  showErrorDetails: PropTypes.bool,
  onError: PropTypes.func,
};

export default ErrorBoundary;
