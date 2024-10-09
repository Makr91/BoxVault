const authJwt = require("./authJwt");
const verifySignUp = require("./verifySignUp");
const verifyBoxName = require("./verifyBoxName");
const verifyProvider = require("./verifyProvider");
const verifyVersion = require("./verifyVersion");
const verifyArchitecture = require("./verifyArchitecture");
const verifyOrganization = require("./verifyOrganization");

module.exports = {
  authJwt,
  verifySignUp,
  verifyBoxName,
  verifyProvider,
  verifyVersion,
  verifyArchitecture,
  verifyOrganization
};
