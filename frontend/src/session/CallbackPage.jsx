import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { Alert, Container, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

/**
 * The page a sign-in lands on: runs the provider's exchange exactly once,
 * hands the session to `onDone`, and shows the failure with a way home.
 * A failure carrying `messageKey` is shown through that translation key.
 */
const CallbackPage = ({ complete, onDone, homeHref = '/' }) => {
  const { t } = useTranslation();
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    complete()
      .then(onDone)
      .catch(failure => setError(failure.messageKey ? t(failure.messageKey) : failure.message));
  }, [complete, onDone, t]);

  return (
    <Container className="py-5">
      {error ? (
        <Alert variant="danger">
          {t('session.failed', { message: error })}{' '}
          <Alert.Link href={homeHref}>{t('session.returnLink')}</Alert.Link> {t('session.tryAgain')}
        </Alert>
      ) : (
        <p className="d-flex align-items-center gap-2">
          <Spinner animation="border" size="sm" role="status" />
          {t('session.completing')}
        </p>
      )}
    </Container>
  );
};

CallbackPage.propTypes = {
  complete: PropTypes.func.isRequired,
  onDone: PropTypes.func.isRequired,
  homeHref: PropTypes.string,
};

export default CallbackPage;
