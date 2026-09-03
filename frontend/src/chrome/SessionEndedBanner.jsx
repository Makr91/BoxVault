import { useTranslation } from 'react-i18next';
import { FaTriangleExclamation } from 'react-icons/fa6';

const SessionEndedBanner = () => {
  const { t } = useTranslation();
  return (
    <div className="navbar-session-strip w-100" role="alert">
      <FaTriangleExclamation className="flex-shrink-0" aria-hidden />
      <strong>{t('sessionEnded.title')}</strong>
      <span>{t('sessionEnded.body')}</span>
    </div>
  );
};

export default SessionEndedBanner;
