// gravatar.js
// Server-side Gravatar profile proxy (#17): the Gravatar API key lives only on
// the server. Browsers request profiles from this endpoint; BoxVault attaches
// the key and relays the public profile JSON.
import axios from 'axios';
import { loadConfig } from '../../utils/config-loader.js';
import { log } from '../../utils/Logger.js';

// Gravatar hashes are hex digests (md5 = 32, sha256 = 64)
const EMAIL_HASH_PATTERN = /^[a-f0-9]{32,64}$/i;

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
 *       404:
 *         description: Profile not found or Gravatar not configured
 *       500:
 *         description: Internal server error
 */
export const getGravatarProfile = async (req, res) => {
  const { emailHash } = req.params;

  if (!EMAIL_HASH_PATTERN.test(emailHash)) {
    return res.status(400).send({ message: req.__('errors.operationFailed') });
  }

  try {
    const appConfig = loadConfig('app');
    const baseUrl = appConfig.gravatar?.base_url?.value;
    const apiKey = appConfig.gravatar?.api_key?.value;

    if (!baseUrl) {
      return res.status(404).send({ message: req.__('config.gravatarNotFound') });
    }

    const headers = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await axios.get(`${baseUrl}${emailHash.toLowerCase()}`, { headers });
    return res.send(response.data);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).send({ message: req.__('config.gravatarNotFound') });
    }
    log.error.error('Error proxying gravatar profile:', err.message);
    return res.status(500).send({ message: req.__('errors.operationFailed') });
  }
};
