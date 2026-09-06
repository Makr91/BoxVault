import { getRulesDocument } from '../utils/rules.js';
import { validateObject } from '../utils/validation.js';
import { refuse } from '../utils/problem.js';

/**
 * Evaluate the request body against one form of the rules document and
 * refuse the write with 422 and pointers when a rule fails. A partial form
 * (an update) evaluates every member present and requires none.
 * @param {string} form - A key of the rules document's `forms`
 * @param {{ partial?: boolean }} [options] - `partial` drops `required`
 * @returns {import('express').RequestHandler}
 */
const validateBody =
  (form, { partial = false } = {}) =>
  (req, res, next) => {
    const document = getRulesDocument();
    const schema = document.forms[form];
    const rule = partial ? { ...schema, required: [] } : schema;
    const errors = validateObject(rule, req.body || {}, document);
    return errors.length > 0 ? refuse(res, req, errors) : next();
  };

export { validateBody };
