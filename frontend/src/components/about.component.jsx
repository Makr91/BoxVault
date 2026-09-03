import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FaBook,
  FaChevronRight,
  FaCircleCheck,
  FaCode,
  FaCubes,
  FaGithub,
  FaHeart,
  FaRocket,
  FaServer,
  FaStar,
} from 'react-icons/fa6';

import { BrandLogo } from '../chromeProps';
import AuthService from '../services/auth.service';
import FavoritesService from '../services/favorites.service';
import UserService from '../services/user.service';
import { log } from '../utils/Logger';
import BoxVaultVersion from '../version.json';

const toCamelCase = str => {
  if (!str) {
    return '';
  }
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
      index === 0 ? word.toLowerCase() : word.toUpperCase()
    )
    .replace(/\s+/g, '');
};

const DOCS = [
  { key: 'fullDocs', href: '/docs', Icon: FaBook },
  { key: 'apiExplorer', href: '/api-docs', Icon: FaCode },
  { key: 'gettingStarted', href: '/docs/guides/', Icon: FaServer },
];

const SUPPORT = [
  { key: 'patreon', href: 'https://www.patreon.com/Philotic', Icon: FaHeart, tone: 'danger' },
  { key: 'githubProfile', href: 'https://github.com/makr91', Icon: FaGithub, tone: 'secondary' },
  { key: 'repository', href: 'https://github.com/makr91/BoxVault', Icon: FaCode, tone: 'primary' },
];

const EMPTY = { title: '', description: '', components: [], features: [], goal: '' };

const SectionTitle = ({ Icon, children }) => (
  <h2 className="h5 d-flex align-items-center gap-2 mb-3">
    <Icon className="text-primary" aria-hidden />
    {children}
  </h2>
);

SectionTitle.propTypes = {
  Icon: PropTypes.elementType.isRequired,
  children: PropTypes.node.isRequired,
};

const About = ({ theme }) => {
  const { t, i18n } = useTranslation();
  const [projectData, setProjectData] = useState(EMPTY);
  const [currentUser, setCurrentUser] = useState(null);
  const [isBoxVaultFavorited, setIsBoxVaultFavorited] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState('');

  useEffect(() => {
    document.title = t('about.pageTitle');
  }, [t]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await UserService.getPublicContent();
        setProjectData(response.data);
      } catch (error) {
        const content =
          (error.response && error.response.data) || error.message || error.toString();
        setProjectData(prevData => ({ ...prevData, title: content }));
      }

      const user = AuthService.getCurrentUser();
      setCurrentUser(user);

      if (user?.provider?.startsWith('oidc-')) {
        try {
          const favResponse = await FavoritesService.getFavorites();
          const favorites = favResponse.data || [];
          setIsBoxVaultFavorited(favorites.some(f => f.clientId === 'boxvault'));
        } catch (error) {
          log.api.error('Error loading favorites', {
            error: error.message,
          });
        }
      }
    };

    loadData();
  }, [i18n.language]);

  const handleToggleFavorite = async () => {
    try {
      const response = await FavoritesService.getFavorites();
      let favorites = response.data || [];

      if (isBoxVaultFavorited) {
        favorites = FavoritesService.removeFavorite(favorites, 'boxvault');
        setFavoriteMessage(t('messages.removedFromFavorites', { ns: 'common' }));
      } else {
        favorites = FavoritesService.addFavorite(favorites, 'boxvault', null);
        setFavoriteMessage(t('messages.addedToFavorites', { ns: 'common' }));
      }

      await FavoritesService.saveFavorites(favorites);
      setIsBoxVaultFavorited(!isBoxVaultFavorited);

      setTimeout(() => setFavoriteMessage(''), 3000);
    } catch (error) {
      log.component.error('Error toggling favorite', {
        clientId: 'boxvault',
        error: error.message,
      });
      setFavoriteMessage(t('messages.failedToUpdateFavorites', { ns: 'common' }));
      setTimeout(() => setFavoriteMessage(''), 3000);
    }
  };

  const oidc = Boolean(currentUser?.provider?.startsWith('oidc-'));

  return (
    <div className="container py-3">
      <section className="row align-items-center g-4 mb-5">
        <div className="col-lg-7">
          <div className="d-flex align-items-center gap-3 mb-3">
            <BrandLogo theme={theme} className="logo-xl flex-shrink-0" />
            <h1 className="display-6 fw-bold mb-0">
              {projectData.title || t('about.fallbackTitle')}
            </h1>
          </div>
          <p className="lead text-body-secondary">
            {projectData.description || t('about.fallbackDescription')}
          </p>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <span className="badge rounded-pill text-bg-primary fs-6 fw-semibold">
              v{BoxVaultVersion.version}
            </span>
            {DOCS.map(({ key, href, Icon }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-2"
              >
                <Icon aria-hidden />
                {t(`about.documentation.${key}`)}
              </a>
            ))}
            {oidc ? (
              <button
                type="button"
                className={`btn btn-sm ${isBoxVaultFavorited ? 'btn-warning' : 'btn-outline-warning'} d-inline-flex align-items-center gap-2`}
                onClick={handleToggleFavorite}
              >
                <FaStar aria-hidden />
                {isBoxVaultFavorited ? t('about.removeFromFavorites') : t('about.addToFavorites')}
              </button>
            ) : null}
          </div>
          {favoriteMessage ? (
            <div className="alert alert-info mt-3 mb-0 py-2">{favoriteMessage}</div>
          ) : null}
        </div>
        <div className="col-lg-5">
          <figure className="p-4 rounded-3 border bg-body-tertiary mb-0">
            <blockquote className="blockquote mb-0 fs-5 fst-italic">
              {projectData.goal || t('about.fallbackGoal')}
            </blockquote>
          </figure>
        </div>
      </section>

      <section className="mb-5">
        <SectionTitle Icon={FaRocket}>{t('about.keyFeatures')}</SectionTitle>
        <div className="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3">
          {projectData.features.map(feature => (
            <div key={feature} className="col">
              <div className="d-flex align-items-start gap-2 p-3 h-100 rounded-3 border bg-body">
                <FaCircleCheck className="text-success flex-shrink-0 mt-1" aria-hidden />
                <span>
                  {t(`about.features.${toCamelCase(feature)}`, { defaultValue: feature })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="row g-4 mb-5">
        <div className="col-lg-6">
          <SectionTitle Icon={FaBook}>{t('about.documentation.title')}</SectionTitle>
          <p className="text-body-secondary">{t('about.documentation.description')}</p>
          <div className="list-group shadow-sm">
            {DOCS.map(({ key, href, Icon }) => (
              <a
                key={key}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="list-group-item list-group-item-action d-flex align-items-center gap-3 py-3"
              >
                <Icon className="text-primary fs-5 flex-shrink-0" aria-hidden />
                <span className="flex-grow-1">{t(`about.documentation.${key}`)}</span>
                <FaChevronRight className="text-body-secondary small" aria-hidden />
              </a>
            ))}
          </div>
        </div>
        <div className="col-lg-6">
          <SectionTitle Icon={FaCubes}>{t('about.components.title')}</SectionTitle>
          <div className="row row-cols-1 row-cols-sm-2 g-3">
            {projectData.components.map(component => (
              <div key={component.title} className="col">
                <div className="p-3 h-100 rounded-3 border bg-body">
                  <h3 className="h6 fw-bold mb-2">{t(component.title)}</h3>
                  <ul className="list-unstyled mb-0 small">
                    {component.details.map(detail => (
                      <li key={detail} className="d-flex align-items-start gap-2 mb-1">
                        <FaChevronRight className="text-primary mt-1 flex-shrink-0" aria-hidden />
                        <span>{t(detail)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-top pt-4 d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <div className="fw-semibold d-flex align-items-center gap-2">
            <FaHeart className="text-danger" aria-hidden />
            {t('about.support.title')}
          </div>
          <div className="text-body-secondary small">{t('about.support.description')}</div>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {SUPPORT.map(({ key, href, Icon, tone }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-sm btn-outline-${tone} d-inline-flex align-items-center gap-2`}
            >
              <Icon aria-hidden />
              {t(`about.support.${key}`)}
            </a>
          ))}
        </div>
      </section>
    </div>
  );
};

About.propTypes = {
  theme: PropTypes.string.isRequired,
};

export default About;
