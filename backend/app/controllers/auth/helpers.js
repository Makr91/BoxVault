// helpers.js
const crypto = require('crypto');

const generateEmailHash = email =>
  crypto.createHash('sha256').update(email.toLowerCase()).digest('hex');

module.exports = {
  generateEmailHash,
};
