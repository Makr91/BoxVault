import PropTypes from "prop-types";
import { Component } from "react";
import { useTranslation } from "react-i18next";

/**
 * Translation wrapper for ErrorBoundary class component
 */
const ErrorBoundaryWithTranslation = ({
  children,
  fallback,
  showErrorDetails,
}) => {
  const { t } = useTranslation(["common"]);

  return (
    <ErrorBoundaryClass
      fallback={fallback}
      showErrorDetails={showErrorDetails}
      translations={{
        somethingWentWrong: t("common:error.somethingWentWrong"),
        unexpectedErrorOccurred: t("common:error.unexpectedErrorOccurred"),
        refreshPage: t("common:error.refreshPage"),
        goHome: t("common:error.goHome"),
        errorDetailsDevelopment: t("common:error.errorDetailsDevelopment"),
      }}
    >
      {children}
    </ErrorBoundaryClass>
  );
};

/**
 * Error boundary component to catch and handle React errors gracefully
 * Prevents white screen crashes by showing fallback UI
 */
class ErrorBoundaryClass extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo,
    });

    // Log error to console in development
    if (import.meta.env.NODE_ENV === "development") {
      console.error("Error Boundary caught an error:", error, errorInfo);
    }

    // In production, send to error reporting service:
    // errorReporting.captureException(error, { extra: errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback, showErrorDetails = false } = this.props;

      // Custom fallback component
      if (Fallback) {
        return <Fallback error={this.state.error} />;
      }

      // Default fallback UI
      return (
        <div className="container-fluid py-5">
          <div className="row justify-content-center">
            <div className="col-md-6">
              <div className="card bg-dark border-danger">
                <div className="card-body text-center">
                  <i className="bi bi-exclamation-triangle display-4 text-danger mb-3" />
                  <h4 className="text-light mb-3">
                    {this.props.translations.somethingWentWrong}
                  </h4>
                  <p className="text-muted mb-4">
                    {this.props.translations.unexpectedErrorOccurred}
                  </p>

                  <div className="d-flex gap-2 justify-content-center">
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={this.handleReload}
                    >
                      <i className="bi bi-arrow-clockwise me-2" />
                      {this.props.translations.refreshPage}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={this.handleGoHome}
                    >
                      <i className="bi bi-house me-2" />
                      {this.props.translations.goHome}
                    </button>
                  </div>

                  {showErrorDetails && this.state.error ? (
                    <details className="mt-4">
                      <summary className="text-muted small">
                        {this.props.translations.errorDetailsDevelopment}
                      </summary>
                      <pre className="text-start text-danger small mt-2">
                        {this.state.error.toString()}
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundaryWithTranslation.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.elementType,
  showErrorDetails: PropTypes.bool,
};

ErrorBoundaryClass.propTypes = {
  children: PropTypes.node.isRequired,
  fallback: PropTypes.elementType,
  showErrorDetails: PropTypes.bool,
  translations: PropTypes.shape({
    somethingWentWrong: PropTypes.string.isRequired,
    unexpectedErrorOccurred: PropTypes.string.isRequired,
    refreshPage: PropTypes.string.isRequired,
    goHome: PropTypes.string.isRequired,
    errorDetailsDevelopment: PropTypes.string.isRequired,
  }).isRequired,
};

export default ErrorBoundaryWithTranslation;
