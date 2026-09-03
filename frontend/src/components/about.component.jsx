import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaBook, FaCode, FaGithub, FaHeart, FaServer } from 'react-icons/fa6';

import { BrandLogo } from '../chromeProps';
import { AboutPage } from '../pages';
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

const About = ({ theme }) => {
  const { t, i18n } = useTranslation();
  const [projectData, setProjectData] = useState(EMPTY);
  const [currentUser, setCurrentUser] = useState(null);
  const [isBoxVaultFavorited, setIsBoxVaultFavorited] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState('');

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
    <AboutPage
      brand={<BrandLogo theme={theme} className="logo-xl flex-shrink-0" />}
      title={projectData.title || t('about.fallbackTitle')}
      description={projectData.description || t('about.fallbackDescription')}
      version={BoxVaultVersion.version}
      goal={projectData.goal || t('about.fallbackGoal')}
      features={projectData.features.map(feature =>
        t(`about.features.${toCamelCase(feature)}`, { defaultValue: feature })
      )}
      components={projectData.components.map(component => ({
        title: t(component.title),
        details: component.details.map(detail => t(detail)),
      }))}
      docs={DOCS.map(doc => ({ ...doc, label: t(`about.documentation.${doc.key}`) }))}
      docsIntro={t('about.documentation.description')}
      support={SUPPORT.map(link => ({ ...link, label: t(`about.support.${link.key}`) }))}
      supportIntro={t('about.support.description')}
      favorite={
        oidc
          ? {
              active: isBoxVaultFavorited,
              onToggle: handleToggleFavorite,
              message: favoriteMessage,
            }
          : null
      }
    />
  );
};

About.propTypes = {
  theme: PropTypes.string.isRequired,
};

export default About;
