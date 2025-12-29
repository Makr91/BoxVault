import React, { useState, useEffect } from "react";
import UserService from "../services/user.service";
import FavoritesService from "../services/favorites.service";
import AuthService from "../services/auth.service";
import BoxVaultVersion from '../version.json';
import { FaStar } from "react-icons/fa6";

const About = () => {
  const [projectData, setProjectData] = useState({
    title: "",
    description: "",
    components: [],
    features: [],
    goal: ""
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [isBoxVaultFavorited, setIsBoxVaultFavorited] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState("");

  useEffect(() => {
    UserService.getPublicContent().then(
      (response) => {
        setProjectData(response.data);
      },
      (error) => {
        const _content =
          (error.response && error.response.data) ||
          error.message ||
          error.toString();

        setProjectData((prevData) => ({ ...prevData, title: _content }));
      }
    );

    // Check if user is logged in and if BoxVault is favorited
    const user = AuthService.getCurrentUser();
    setCurrentUser(user);

    if (user?.provider?.startsWith('oidc-')) {
      FavoritesService.getFavorites()
        .then(response => {
          const favorites = response.data || [];
          setIsBoxVaultFavorited(favorites.some(f => f.clientId === 'boxvault'));
        })
        .catch(error => console.error('Error loading favorites:', error));
    }
  }, []);

  const handleToggleFavorite = async () => {
    try {
      const response = await FavoritesService.getFavorites();
      let favorites = response.data || [];

      if (isBoxVaultFavorited) {
        // Remove from favorites
        favorites = FavoritesService.removeFavorite(favorites, 'boxvault');
        setFavoriteMessage('Removed BoxVault from favorites');
      } else {
        // Add to favorites
        favorites = FavoritesService.addFavorite(favorites, 'boxvault', null);
        setFavoriteMessage('Added BoxVault to favorites!');
      }

      await FavoritesService.saveFavorites(favorites);
      setIsBoxVaultFavorited(!isBoxVaultFavorited);
      
      // Clear message after 3 seconds
      setTimeout(() => setFavoriteMessage(''), 3000);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      setFavoriteMessage('Failed to update favorites');
      setTimeout(() => setFavoriteMessage(''), 3000);
    }
  };

  return (
    <div className="list row">
      <header className="header">
        <h1 className="title">{projectData.title}</h1>
        <p className="description">{projectData.description}</p>
        <h2 className="title">Version: {BoxVaultVersion.version}</h2>

        {currentUser?.provider?.startsWith('oidc-') && (
          <div className="mb-4">
            <button 
              className={`btn ${isBoxVaultFavorited ? 'btn-warning' : 'btn-outline-warning'}`}
              onClick={handleToggleFavorite}
            >
              <FaStar className="me-2" />
              {isBoxVaultFavorited ? 'Remove from Favorites' : 'Add to Favorites'}
            </button>
            {favoriteMessage && (
              <div className="alert alert-info mt-2">
                {favoriteMessage}
              </div>
            )}
          </div>
        )}

        {projectData.components.map((component, index) => (
          <section key={index} className="section">
            <h2 className="section-title">{component.title}</h2>
            <ul className="list">
              {component.details.map((detail, idx) => (
                <li key={idx} className="list-item">{detail}</li>
              ))}
            </ul>
          </section>
        ))}

        <h2 className="section-title">Key Features:</h2>
        <ul className="list">
          {projectData.features.map((feature, index) => (
            <li key={index} className="list-item">{feature}</li>
          ))}
        </ul>

        <p className="goal">{projectData.goal}</p>

        <section className="support-section">
          <h2 className="section-title">Support and Follow</h2>
          <ul className="list">
            <li className="list-item">
              <a href="https://www.patreon.com/Philotic" target="_blank" rel="noopener noreferrer" className="link">
                Support on Patreon
              </a>
            </li>
            <li className="list-item">
              <a href="https://github.com/makr91" target="_blank" rel="noopener noreferrer" className="link">
                GitHub Profile
              </a>
            </li>
            <li className="list-item">
              <a href="https://github.com/makr91/BoxVault" target="_blank" rel="noopener noreferrer" className="link">
                Project Repository
              </a>
            </li>
          </ul>
        </section>
      </header>
    </div>
  );
};

export default About;
