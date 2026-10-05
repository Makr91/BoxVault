import { log } from '../../utils/Logger.js';
import { problem, refuse } from '../../utils/problem.js';
import {
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  parseLimit,
  parseKinds,
  parseScope,
  withinScope,
  cursorOf,
  offsetOf,
  wordsOf,
  buildContext,
} from './scope.js';
import { FINDERS } from './finders.js';

/**
 * The score of a title for the query's words: 3 when the title equals the
 * words joined by one space, 2 when it starts with them, 1 when every word
 * lies inside it, 0 otherwise.
 * @param {string} title - The lower-cased title
 * @param {string[]} words - The lower-cased query words
 * @returns {number} The score
 */
const nameScore = (title, words) => {
  const phrase = words.join(' ');
  if (title === phrase) {
    return 3;
  }
  if (title.startsWith(phrase)) {
    return 2;
  }
  return words.every(word => title.includes(word)) ? 1 : 0;
};

/**
 * The offsets of each word's first occurrence in a text, sorted by start,
 * the words the text does not hold left out.
 * @param {string} text - The matched field's text
 * @param {string[]} words - The lower-cased query words
 * @returns {Array<[number, number]>} The start and end of each span
 */
const spansOf = (text, words) => {
  const lower = text.toLowerCase();
  return words
    .map(word => [lower.indexOf(word), word.length])
    .filter(([start]) => start >= 0)
    .map(([start, length]) => [start, start + length])
    .sort((a, b) => a[0] - b[0]);
};

/**
 * The smallest position of any query word in a title, past every position
 * when the title holds none.
 * @param {string} title - The title
 * @param {string[]} words - The lower-cased query words
 * @returns {number} The position
 */
const positionOf = (title, words) => {
  const lower = title.toLowerCase();
  const positions = words.map(word => lower.indexOf(word)).filter(at => at >= 0);
  return positions.length > 0 ? Math.min(...positions) : Number.MAX_SAFE_INTEGER;
};

/**
 * A finder's row with its score and the spans of its highlight.
 * @param {Object} row - The row from the finders
 * @param {string[]} words - The lower-cased query words
 * @returns {Object} The result
 */
const ranked = (row, words) => {
  const { text } = row.highlight[row.matched];
  return {
    ...row,
    score: nameScore(row.title.toLowerCase(), words),
    highlight: { [row.matched]: { text, spans: spansOf(text, words) } },
  };
};

/**
 * The order of results: score descending, then the match position in the
 * title, then the title, then the id.
 * @param {string[]} words - The lower-cased query words
 * @returns {Function} The comparator
 */
const compareFor = words => (a, b) =>
  b.score - a.score ||
  positionOf(a.title, words) - positionOf(b.title, words) ||
  a.title.localeCompare(b.title) ||
  a.id.localeCompare(b.id);

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search the whole app
 *     description: Case-insensitive substring search across organizations, boxes, ISOs, downloads with their releases, patches and files, versions, providers, architectures, artifacts and users, every word of the query matching some field of the hit. A caller only gets what the caller could already list - anonymous requests see public, published items and discoverable organizations; a signed-in user additionally sees every organization they belong to and its items, a service-account key its own organization; users are answered only to a global admin (every user) or to an organization owner or admin (that organization's members). Box and ISO metadata is matched on its whitelisted keys, never on the password key. Every kind's matches are scored, 3 when the lower-cased title equals the query's lower-cased words joined by one space, 2 when it starts with them, 1 when every word lies inside it, 0 otherwise, and sorted by score descending, then the smallest position of any word in the title, then title, then id. Several kinds answer the first limit rows of each kind sorted together; one kind answers the page the after cursor names and the cursor of the next page. Every answer carries Cache-Control no-store.
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
 *           maxLength: 200
 *         description: The text to look for, 2 to 200 characters after trimming
 *       - in: query
 *         name: kinds
 *         schema:
 *           type: string
 *         description: Comma list restricting the kinds searched (organization, item, version, provider, architecture, artifact, user); unknown kinds are dropped, none means all seven
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *         description: org:<name> keeps the results of that organization, compared case-insensitively; collection:<key> keeps the results of that collection; any other value is no scope
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 5
 *         description: Maximum results per kind
 *       - in: query
 *         name: after
 *         schema:
 *           type: string
 *         description: The next cursor of a previous answer, honoured only while kinds names exactly one kind; a cursor that does not decode or was minted for another query, kind or scope answers the first page
 *       - in: header
 *         name: x-access-token
 *         schema:
 *           type: string
 *         description: Optional JWT token (or raw service-account key) for member visibility
 *     responses:
 *       200:
 *         description: The page of results and the count of every kind searched
 *         headers:
 *           Cache-Control:
 *             schema:
 *               type: string
 *               example: no-store
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [query, kinds, scope, counts, results, next]
 *               properties:
 *                 query:
 *                   type: string
 *                   description: The trimmed search term
 *                 kinds:
 *                   type: array
 *                   description: The kinds searched, in canonical order
 *                   items:
 *                     type: string
 *                     enum: [organization, item, version, provider, architecture, artifact, user]
 *                 scope:
 *                   type: string
 *                   description: The scope applied, empty for none
 *                 counts:
 *                   type: object
 *                   description: Per kind searched, how many results matched after scope and visibility
 *                   additionalProperties:
 *                     type: object
 *                     required: [value, relation]
 *                     properties:
 *                       value:
 *                         type: integer
 *                       relation:
 *                         type: string
 *                         enum: [eq]
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [kind, id, collection, org, name, version, provider, architecture, anchor, source, score, title, subtitle, matched, highlight, facets]
 *                     properties:
 *                       kind:
 *                         type: string
 *                         enum: [organization, item, version, provider, architecture, artifact, user]
 *                       id:
 *                         type: string
 *                         description: Natural key unique within the kind, the locator members the kind names joined with a slash - organization org; item collection/org/name; version adds version; provider adds provider; architecture adds architecture; artifact adds provider (empty for an ISO), architecture and the file name; user org/name
 *                       collection:
 *                         type: string
 *                         nullable: true
 *                         enum: [boxes, isos, downloads]
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
 *                       anchor:
 *                         type: string
 *                         description: The file name of an artifact or a downloads file, else empty
 *                       source:
 *                         type: object
 *                         nullable: true
 *                         description: Always null here
 *                       score:
 *                         type: integer
 *                         enum: [0, 1, 2, 3]
 *                       title:
 *                         type: string
 *                         description: The display text of the hit
 *                       subtitle:
 *                         type: string
 *                         description: The org · collection · version chain above the hit as plain text
 *                       matched:
 *                         type: string
 *                         description: The field that matched, metadata keys as metadata.<key>
 *                       highlight:
 *                         type: object
 *                         description: Keyed by the matched field, its text and the start and end offsets of each query word's first occurrence in it
 *                         additionalProperties:
 *                           type: object
 *                           required: [text, spans]
 *                           properties:
 *                             text:
 *                               type: string
 *                             spans:
 *                               type: array
 *                               items:
 *                                 type: array
 *                                 items:
 *                                   type: integer
 *                       facets:
 *                         type: object
 *                         description: The collection of a row that has one, else empty
 *                 next:
 *                   type: string
 *                   nullable: true
 *                   description: The cursor of the next page while kinds names one kind and more results remain, else null
 *       422:
 *         description: The query is shorter than 2 or longer than 200 characters, errors carrying pointer /q and rule minLength or maxLength
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
const search = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const term = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (term.length < MIN_QUERY_LENGTH) {
    return refuse(res, req, [
      { pointer: '/q', rule: 'minLength', params: { minLength: MIN_QUERY_LENGTH } },
    ]);
  }
  if (term.length > MAX_QUERY_LENGTH) {
    return refuse(res, req, [
      { pointer: '/q', rule: 'maxLength', params: { maxLength: MAX_QUERY_LENGTH } },
    ]);
  }
  const limit = parseLimit(req.query.limit);
  const kinds = parseKinds(req.query.kinds);
  const scope = parseScope(req.query.scope);

  try {
    const context = await buildContext(req, term, kinds);
    const found = await Promise.all(kinds.map(kind => FINDERS[kind](context)));
    const words = wordsOf(term.toLowerCase());
    const compare = compareFor(words);
    const sorted = found.map(rows =>
      rows
        .filter(row => withinScope(row, scope))
        .map(row => ranked(row, words))
        .sort(compare)
    );
    const counts = Object.fromEntries(
      kinds.map((kind, index) => [kind, { value: sorted[index].length, relation: 'eq' }])
    );
    const single = kinds.length === 1;
    const offset = single ? offsetOf(req.query.after, { q: term, kind: kinds[0], scope }) : 0;
    const results = sorted.flatMap(rows => rows.slice(offset, offset + limit)).sort(compare);
    const next =
      single && offset + limit < sorted[0].length
        ? cursorOf({ q: term, kind: kinds[0], scope, offset: offset + limit })
        : null;

    return res.send({ query: term, kinds, scope, counts, results, next });
  } catch (err) {
    log.error.error('Error searching:', err);
    return problem(res, req, { status: 500, type: 'internal' });
  }
};

export { search };
