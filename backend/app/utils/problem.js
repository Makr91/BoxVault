const PROBLEM_BASE = 'https://auth.startcloud.com/probs/';

const TITLE_KEYS = {
  validation: 'problems.validation',
  conflict: 'problems.conflict',
  'bad-request': 'problems.badRequest',
  forbidden: 'problems.forbidden',
  'not-found': 'problems.notFound',
  internal: 'problems.internal',
};

const fieldOf = pointer => pointer.split('/').filter(Boolean).pop() || '';

const detailFor = (req, error) =>
  req.__(`validation.${error.rule}`, { field: fieldOf(error.pointer), ...(error.params || {}) });

/**
 * Send one RFC 9457 problem body as `application/problem+json`.
 * @param {import('express').Response} res - Express response
 * @param {import('express').Request} req - Express request (i18n)
 * @param {{status: number, type: string, title?: string, errors?: Array<{pointer: string, rule: string, params?: Object, detail?: string}>}} body - The problem
 * @returns {import('express').Response}
 */
const problem = (res, req, { status, type, title, errors = [] }) =>
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
