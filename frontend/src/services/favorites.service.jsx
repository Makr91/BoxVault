import axios from "axios";

import authHeader from "./auth-header";

const baseURL = window.location.origin;

const getFavorites = () =>
  axios.get(`${baseURL}/api/favorites`, { headers: authHeader() });

const saveFavorites = (favoritesArray) =>
  axios.post(`${baseURL}/api/favorites/save`, favoritesArray, {
    headers: {
      ...authHeader(),
      "Content-Type": "application/json",
    },
  });

const getUserInfoClaims = () =>
  axios.get(`${baseURL}/api/userinfo/claims`, { headers: authHeader() });

const getEnrichedFavorites = () =>
  axios.get(`${baseURL}/api/userinfo/favorites`, { headers: authHeader() });

const addFavorite = (currentFavorites, clientId, customLabel = null) => {
  const newFavorite = {
    clientId,
    customLabel,
    order: currentFavorites.length,
  };

  return [...currentFavorites, newFavorite];
};

const removeFavorite = (currentFavorites, clientId) =>
  currentFavorites.filter((f) => f.clientId !== clientId);

const reorderFavorites = (currentFavorites, fromIndex, toIndex) => {
  const reordered = [...currentFavorites];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  // Update order values
  return reordered.map((fav, idx) => ({
    ...fav,
    order: idx,
  }));
};

const FavoritesService = {
  getFavorites,
  saveFavorites,
  getUserInfoClaims,
  getEnrichedFavorites,
  addFavorite,
  removeFavorite,
  reorderFavorites,
};

export default FavoritesService;
