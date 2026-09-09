// gravatar.js
// Server-side Gravatar profile proxy (#17): the Gravatar API key lives only on
// the server. Browsers request profiles from this endpoint; BoxVault attaches
// the key and relays the public profile JSON.
import axios from 'axios';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';
import { problem } from '../../utils/problem.js';

// Gravatar hashes are hex digests (md5 = 32, sha256 = 64)
const EMAIL_HASH_PATTERN = /^[a-f0-9]{32,64}$/i;

const gravatarNotFound = (req, res) =>
  problem(res, req, {
    status: 404,
    type: 'not-found',
    title: req.__('config.gravatarNotFound'),
  });

/**
 * @swagger
 * /api/gravatar/profile/{emailHash}:
 *   get:
 *     summary: Fetch a Gravatar profile via the server-side proxy
 *     description: >-
 *       Retrieves the public Gravatar profile for an email hash. The Gravatar
 *       API key is attached server-side and never reaches the browser.
 *     tags: [Configuration]
 *     parameters:
 *       - in: path
 *         name: emailHash
 *         required: true
 *         schema:
 *           type: string
 *         description: Hex email hash (md5 or sha256)
 *     responses:
 *       200:
 *         description: Gravatar profile JSON
 *       400:
 *         description: Invalid email hash
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       404:
 *         description: Profile not found or Gravatar not configured
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/problem+json:
 *             schema:
 *               $ref: '#/components/schemas/Problem'
 */
export const getGravatarProfile = async (req, res) => {
  const { emailHash } = req.params;

  if (!EMAIL_HASH_PATTERN.test(emailHash)) {
    return problem(res, req, {
      status: 400,
      type: 'bad-request',
      title: req.__('errors.operationFailed'),
    });
  }

  try {
    const appConfig = loadConfig('app');
    const baseUrl = appConfig.gravatar?.base_url;
    const apiKey = appConfig.gravatar?.api_key;

    if (!baseUrl) {
      return gravatarNotFound(req, res);
    }

    const headers = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await axios.get(`${baseUrl}${emailHash.toLowerCase()}`, { headers });
    return res.send(response.data);
  } catch (err) {
    if (err.response?.status === 404) {
      return gravatarNotFound(req, res);
    }
    log.error.error('Error proxying gravatar profile:', err.message);
    return problem(res, req, {
      status: 500,
      type: 'internal',
      title: req.__('errors.operationFailed'),
    });
  }
};
