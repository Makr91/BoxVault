const PROBLEM_BASE = 'https://auth.startcloud.com/probs/';

const TITLE_KEYS = {
  validation: 'problems.validation',
  conflict: 'problems.conflict',
  'bad-request': 'problems.badRequest',
  authentication: 'problems.authentication',
  forbidden: 'problems.forbidden',
  'not-found': 'problems.notFound',
  'payload-too-large': 'problems.payloadTooLarge',
  throttled: 'problems.throttled',
  internal: 'problems.internal',
  'send-failed': 'problems.sendFailed',
  'bad-gateway': 'problems.badGateway',
};

const fieldOf = pointer => pointer.split('/').filter(Boolean).pop() || '';

const detailFor = (req, error) =>
  req.__(`validation.${error.rule}`, { field: fieldOf(error.pointer), ...(error.params || {}) });

const HTML = /\btext\/html\b/i;

const CHALLENGE = 'Bearer';

const wantsPage = req =>
  HTML.test(req?.headers?.accept || '') && req.accepts(['json', 'html']) === 'html';

const body = (res, req, { status, type, title, errors = [] }) =>
  res
    .status(status)
    .type('application/problem+json')
    .send({
      type: `${PROBLEM_BASE}${type}`,
      title: title || req.__(TITLE_KEYS[type]),
      status,
      errors: errors.map(error => ({
        pointer: error.pointer,
        rule: error.rule,
        params: error.params || {},
        detail: error.detail || detailFor(req, error),
      })),
    });

/**
 * Send one RFC 9457 problem body as `application/problem+json`; a request
 * whose `Accept` names `text/html` and prefers it to JSON is a browser
 * navigation and is answered the UI's page instead, carrying the fault on
 * `<html>` with the fault's own status, the problem body answering only when
 * the page cannot be read. A 401 carries `WWW-Authenticate: Bearer` either
 * way (RFC 9110 §11.6.1, RFC 6750 §3).
 * @param {import('express').Response} res - Express response
 * @param {import('express').Request} req - Express request (i18n)
 * @param {{status: number, type: string, title?: string, errors?: Array<{pointer: string, rule: string, params?: Object, detail?: string}>}} problemBody - The problem
 * @returns {import('express').Response|Promise<import('express').Response>} The response, a promise of it for the page
 */
const problem = (res, req, problemBody) => {
  if (problemBody.status === 401) {
    res.set('WWW-Authenticate', CHALLENGE);
  }
  return wantsPage(req)
    ? import('../middleware/uiIndex.js').then(
        ({ errorPage }) => errorPage(req, res, problemBody) || body(res, req, problemBody)
      )
    : body(res, req, problemBody);
};

/**
 * Refuse a write with its failing rules: 409 `conflict` when every failing
 * rule is `unique`, 422 `validation` otherwise.
 * @param {import('express').Response} res - Express response
 * @param {import('express').Request} req - Express request (i18n)
 * @param {Array<{pointer: string, rule: string, params?: Object}>} errors - The failing rules
 * @param {string} [title] - A title replacing the type's own
 * @returns {import('express').Response}
 */
const refuse = (res, req, errors, title) => {
  const conflict = errors.every(error => error.rule === 'unique');
  return problem(res, req, {
    status: conflict ? 409 : 422,
    type: conflict ? 'conflict' : 'validation',
    title,
    errors,
  });
};

/**
 * Refuse a write because one value is already taken within its scope.
 * @param {import('express').Response} res - Express response
 * @param {import('express').Request} req - Express request (i18n)
 * @param {string} pointer - JSON Pointer of the taken value
 * @param {string} scope - The name of the scope the value collided in
 * @returns {import('express').Response}
 */
const conflict = (res, req, pointer, scope) =>
  refuse(res, req, [{ pointer, rule: 'unique', params: { scope } }]);

export { problem, refuse, conflict };
