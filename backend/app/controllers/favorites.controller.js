// favorites.controller.js
const { getFavorites } = require('./favorites/get');
const { saveFavorites } = require('./favorites/save');
const { getUserInfoClaims } = require('./favorites/claims');
const { getEnrichedFavorites } = require('./favorites/enriched');

module.exports = {
  getFavorites,
  saveFavorites,
  getUserInfoClaims,
  getEnrichedFavorites,
};
