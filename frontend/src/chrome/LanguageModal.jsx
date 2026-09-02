import PropTypes from 'prop-types';
import { useState } from 'react';
import { Modal } from 'react-bootstrap';
import CountryFlag from 'react-country-flag';
import { useTranslation } from 'react-i18next';
import { FaCircleCheck, FaGlobe } from 'react-icons/fa6';

export const getLanguageDisplayName = languageCode => {
  const code = languageCode || 'en';
  if (code === 'cimode') {
    return 'CI/CD Mode';
  }
  try {
    const displayNames = new Intl.DisplayNames([code], { type: 'language' });
    const name = displayNames.of(code);
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
};

export const getLanguageFlag = languageCode => {
  const code = languageCode || 'en';
  if (code === 'cimode') {
    return '🔧';
  }
  try {
    const locale = new Intl.Locale(code);
    const region = locale.region || locale.maximize().region;
    if (region) {
      return <CountryFlag countryCode={region} svg title={region} />;
    }
  } catch {
    return '🌐';
  }
  return '🌐';
};

export const LanguageModal = ({ show, current, languages, onPick, onClose }) => {
  const { t } = useTranslation();
  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title as="h5">
          <FaGlobe className="me-2" />
          {t('language.changeLanguage')}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="list-group">
          {languages.map(lang => (
            <button
              key={lang}
              type="button"
              className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                current === lang ? 'border-primary border-2' : ''
              }`}
              onClick={() => onPick(lang)}
            >
              <span>
                <span className="me-2 flag-icon-lg">{getLanguageFlag(lang)}</span>
                {getLanguageDisplayName(lang)}
              </span>
              {current === lang ? <FaCircleCheck className="text-success" aria-hidden /> : null}
            </button>
          ))}
        </div>
      </Modal.Body>
    </Modal>
  );
};

LanguageModal.propTypes = {
  show: PropTypes.bool.isRequired,
  current: PropTypes.string.isRequired,
  languages: PropTypes.arrayOf(PropTypes.string).isRequired,
  onPick: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export const LanguageButton = ({ languages, onPick }) => {
  const { t, i18n } = useTranslation();
  const [show, setShow] = useState(false);
  const label = `${t('language.changeLanguage')}: ${getLanguageDisplayName(i18n.language)}`;

  const pick = async lang => {
    await onPick(lang);
    setShow(false);
  };

  return (
    <li className="nav-item">
      <button
        type="button"
        className="btn btn-link nav-link cluster-btn"
        onClick={() => setShow(true)}
        title={label}
        aria-label={label}
      >
        {getLanguageFlag(i18n.language)}
      </button>
      <LanguageModal
        show={show}
        current={i18n.language}
        languages={languages}
        onPick={pick}
        onClose={() => setShow(false)}
      />
    </li>
  );
};

LanguageButton.propTypes = {
  languages: PropTypes.arrayOf(PropTypes.string).isRequired,
  onPick: PropTypes.func.isRequired,
};
