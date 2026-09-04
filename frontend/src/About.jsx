import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FaBook, FaCode, FaGithub, FaHeart, FaServer } from 'react-icons/fa6';

import { log, useNotify } from './chrome';
import { BrandLogo, session } from './chromeProps';
import { AboutPage, responseMessage } from './pages';
import { api } from './services/api';
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
const FAVORITE_KEY = 'favorite';
const CLIENT_ID = 'boxvault';

const withoutFavorite = favorites => favorites.filter(entry => entry.clientId !== CLIENT_ID);

const withFavorite = favorites => [
  ...favorites,
  { clientId: CLIENT_ID, customLabel: null, order: favorites.length },
];

const About = ({ theme }) => {
  const { t, i18n } = useTranslation();
  const notify = useNotify();
  const [projectData, setProjectData] = useState(EMPTY);
  const [currentUser, setCurrentUser] = useState(null);
  const [isBoxVaultFavorited, setIsBoxVaultFavorited] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setProjectData(await api.users.publicContent(i18n.language));
      } catch (error) {
        notify('danger', responseMessage(error, error.message || error.toString()));
      }

      const user = session.current();
      setCurrentUser(user);

      if (user?.provider?.startsWith('oidc-')) {
        try {
          const favorites = (await api.favorites.get()) || [];
          setIsBoxVaultFavorited(favorites.some(f => f.clientId === CLIENT_ID));
        } catch (error) {
          log.api.error('Error loading favorites', {
            error: error.message,
          });
        }
      }
    };

    loadData();
  }, [i18n.language, notify]);

  const handleToggleFavorite = async () => {
    try {
      const current = (await api.favorites.get()) || [];
      const favorites = isBoxVaultFavorited ? withoutFavorite(current) : withFavorite(current);
      notify(
        'success',
        t(isBoxVaultFavorited ? 'messages.removedFromFavorites' : 'messages.addedToFavorites', {
          ns: 'common',
        }),
        { key: FAVORITE_KEY }
      );

      await api.favorites.save(favorites);
      setIsBoxVaultFavorited(!isBoxVaultFavorited);
    } catch (error) {
      log.component.error('Error toggling favorite', {
        clientId: CLIENT_ID,
        error: error.message,
      });
      notify('danger', t('messages.failedToUpdateFavorites', { ns: 'common' }), {
        key: FAVORITE_KEY,
      });
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
      favorite={oidc ? { active: isBoxVaultFavorited, onToggle: handleToggleFavorite } : null}
    />
  );
};

About.propTypes = {
  theme: PropTypes.string.isRequired,
};

export default About;
