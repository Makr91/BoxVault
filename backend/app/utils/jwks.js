import { createRemoteJWKSet } from 'jose';

const jwksByUri = new Map();

const getRemoteJwks = jwksUri => {
  if (!jwksByUri.has(jwksUri)) {
    jwksByUri.set(jwksUri, createRemoteJWKSet(new URL(jwksUri)));
  }
  return jwksByUri.get(jwksUri);
};

export { getRemoteJwks };
