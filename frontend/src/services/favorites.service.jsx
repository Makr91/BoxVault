import axios from 'axios';

import authHeader from './auth-header';

const baseURL = window.location.origin;

const getFavorites = () => axios.get(`${baseURL}/api/favorites`, { headers: authHeader() });

const saveFavorites = favoritesArray =>
  axios.post(`${baseURL}/api/favorites/save`, favoritesArray, {
    headers: {
      ...authHeader(),
      'Content-Type': 'application/json',
    },
  });

const addFavorite = (currentFavorites, clientId, customLabel = null) => [
  ...currentFavorites,
  { clientId, customLabel, order: currentFavorites.length },
];

const removeFavorite = (currentFavorites, clientId) =>
  currentFavorites.filter(f => f.clientId !== clientId);

const FavoritesService = {
  getFavorites,
  saveFavorites,
  addFavorite,
  removeFavorite,
};

export default FavoritesService;
