import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaBook, FaCode, FaGithub, FaHeart, FaServer } from 'react-icons/fa6';

import { log } from './chrome';
import { BrandLogo, session } from './chromeProps';
import { AboutPage } from './pages';
import FavoritesService from './services/favorites.service';
import UserService from './services/user.service';
import BoxVaultVersion from './version.json';

const DOCS = [
  { key: 'gettingStarted', href: '/docs/guides/', Icon: FaServer },
  { key: 'fullDocs', href: '/docs', Icon: FaBook },
  { key: 'apiExplorer', href: '/api-docs', Icon: FaCode },
];

const SUPPORT = [
  { key: 'patreon', href: 'https://www.patreon.com/Philotic', Icon: FaHeart },
  { key: 'githubProfile', href: 'https://github.com/makr91', Icon: FaGithub },
  { key: 'repository', href: 'https://github.com/makr91/BoxVault', Icon: FaCode },
];

const EMPTY = { title: '', description: '', components: [], features: [], goal: '' };

const About = ({ theme }) => {
  const { t, i18n } = useTranslation();
  const [projectData, setProjectData] = useState(EMPTY);
  const [currentUser, setCurrentUser] = useState(null);
  const [isBoxVaultFavorited, setIsBoxVaultFavorited] = useState(false);
  const [favoriteNotice, setFavoriteNotice] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await UserService.getPublicContent(i18n.language);
        setProjectData(response.data);
      } catch (error) {
        const content =
          (error.response && error.response.data) || error.message || error.toString();
        setProjectData(prevData => ({ ...prevData, title: content }));
      }

      const user = session.current();
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
        setFavoriteNotice({
          type: 'success',
          text: t('messages.removedFromFavorites', { ns: 'common' }),
        });
      } else {
        favorites = FavoritesService.addFavorite(favorites, 'boxvault', null);
        setFavoriteNotice({
          type: 'success',
          text: t('messages.addedToFavorites', { ns: 'common' }),
        });
      }

      await FavoritesService.saveFavorites(favorites);
      setIsBoxVaultFavorited(!isBoxVaultFavorited);

      setTimeout(() => setFavoriteNotice(null), 3000);
    } catch (error) {
      log.component.error('Error toggling favorite', {
        clientId: 'boxvault',
        error: error.message,
      });
      setFavoriteNotice({
        type: 'danger',
        text: t('messages.failedToUpdateFavorites', { ns: 'common' }),
      });
      setTimeout(() => setFavoriteNotice(null), 3000);
    }
  };

  const oidc = Boolean(currentUser?.provider?.startsWith('oidc-'));

  return (
    <AboutPage
      brand={<BrandLogo theme={theme} className="prov-icon" />}
      title={projectData.title || t('about.fallbackTitle')}
      description={projectData.description || t('about.fallbackDescription')}
      version={BoxVaultVersion.version}
      goal={projectData.goal || t('about.fallbackGoal')}
      features={projectData.features}
      components={projectData.components}
      docs={DOCS.map(doc => ({ ...doc, label: t(`about.documentation.${doc.key}`) }))}
      docsIntro={t('about.documentation.description')}
      support={SUPPORT.map(link => ({ ...link, label: t(`about.support.${link.key}`) }))}
      supportIntro={t('about.support.description')}
      favorite={
        oidc
          ? {
              active: isBoxVaultFavorited,
              onToggle: handleToggleFavorite,
              notice: favoriteNotice,
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
