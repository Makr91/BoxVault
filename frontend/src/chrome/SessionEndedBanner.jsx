import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { FaTriangleExclamation } from 'react-icons/fa6';

const SessionEndedBanner = ({ onSignIn = null, signInTo = '', LinkComponent = 'a' }) => {
  const { t } = useTranslation();
  const className = 'btn btn-primary btn-sm';
  return (
    <div
      className="alert alert-warning d-flex align-items-center gap-3 mx-3 mt-3 mb-0"
      role="alert"
    >
      <FaTriangleExclamation className="flex-shrink-0" />
      <div className="flex-grow-1">
        <strong>{t('sessionEnded.title')}</strong>
        <div className="small">{t('sessionEnded.body')}</div>
      </div>
      {signInTo ? (
        <LinkComponent to={signInTo} className={className} onClick={onSignIn || undefined}>
          {t('sessionEnded.signIn')}
        </LinkComponent>
      ) : (
        <button type="button" className={className} onClick={onSignIn}>
          {t('sessionEnded.signIn')}
        </button>
      )}
    </div>
  );
};

SessionEndedBanner.propTypes = {
  onSignIn: PropTypes.func,
  signInTo: PropTypes.string,
  LinkComponent: PropTypes.elementType,
};

export default SessionEndedBanner;
