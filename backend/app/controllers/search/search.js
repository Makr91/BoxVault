import { log } from '../../utils/Logger.js';
import { MIN_QUERY_LENGTH, parseLimit, parseKinds, buildContext } from './scope.js';
import { FINDERS } from './finders.js';

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search the whole app
 *     description: Case-insensitive substring search across organizations, boxes, ISOs, versions, providers, architectures, artifacts and users, answering deep-linkable hits. A caller only gets what the caller could already list - anonymous requests see public, published items and discoverable organizations; a signed-in user additionally sees every organization they belong to and its items, a service-account key its own organization; users are answered only to a global admin (every user) or to an organization owner or admin (that organization's members). Box and ISO metadata is matched on its whitelisted keys, never on the password key, and no metadata value is returned.
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *         description: The text to look for, at least 2 characters after trimming
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 5
 *         description: Maximum hits per kind
 *       - in: query
 *         name: kinds
 *         schema:
 *           type: string
 *         description: Comma list restricting the kinds searched (organization, item, version, provider, architecture, artifact, user)
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: The hits, per kind at most limit rows, and how many more each kind had
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [query, results, truncated]
 *               properties:
 *                 query:
 *                   type: string
 *                   description: The trimmed search term
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [kind, collection, org, name, version, provider, architecture, title, subtitle, matched]
 *                     properties:
 *                       kind:
 *                         type: string
 *                         enum: [organization, item, version, provider, architecture, artifact, user]
 *                       collection:
 *                         type: string
 *                         nullable: true
 *                         enum: [boxes, isos]
 *                       org:
 *                         type: string
 *                         description: The organization slug
 *                       name:
 *                         type: string
 *                         description: The item name, the username for a user, the organization slug for an organization
 *                       version:
 *                         type: string
 *                         description: Filled as deep as the hit goes, else empty
 *                       provider:
 *                         type: string
 *                         description: Filled as deep as the hit goes, else empty
 *                       architecture:
 *                         type: string
 *                         description: Filled as deep as the hit goes, else empty
 *                       title:
 *                         type: string
 *                         description: The display text of the hit
 *                       subtitle:
 *                         type: string
 *                         description: The org · collection · version chain above the hit as plain text
 *                       matched:
 *                         type: string
 *                         description: The field that matched, metadata keys as metadata.<key>
 *                 truncated:
 *                   type: object
 *                   description: Per kind, how many hits beyond limit were dropped; kinds within limit are absent
 *                   additionalProperties:
 *                     type: integer
 *       400:
 *         description: The query is shorter than 2 characters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
const search = async (req, res) => {
  const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (term.length < MIN_QUERY_LENGTH) {
    return res.status(400).send({ message: req.__('search.queryTooShort') });
  }
  const limit = parseLimit(req.query.limit);
  const kinds = parseKinds(req.query.kinds);

  try {
    const context = await buildContext(req, term, kinds);
    const found = await Promise.all(kinds.map(kind => FINDERS[kind](context)));

    const results = [];
    const truncated = {};
    kinds.forEach((kind, index) => {
      const rows = found[index];
      results.push(...rows.slice(0, limit));
      if (rows.length > limit) {
        truncated[kind] = rows.length - limit;
      }
    });

    return res.send({ query: term, results, truncated });
  } catch (err) {
    log.error.error('Error searching:', err);
    return res.status(500).send({ message: req.__('search.error') });
  }
};

export { search };
