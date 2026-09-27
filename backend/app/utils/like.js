import db from '../models/index.js';

const ESCAPE_CHARACTER = '!';

/**
 * A text with the LIKE wildcards and the escape character itself escaped, so
 * every character of it matches only itself.
 * @param {string} text - The text to match literally
 * @returns {string} The text safe to embed in a LIKE pattern
 */
const escapeLike = text => String(text).replace(/[!%_]/g, `${ESCAPE_CHARACTER}$&`);

/**
 * The right-hand side of a LIKE for a finished pattern, carrying its escape
 * character explicitly, so SQLite and MariaDB read the pattern the same way.
 * @param {string} pattern - The pattern, its literal parts already through escapeLike
 * @returns {Object} The Sequelize literal to place under Op.like
 */
const likePattern = pattern =>
  db.sequelize.literal(`${db.sequelize.escape(pattern)} ESCAPE '${ESCAPE_CHARACTER}'`);

/**
 * The LIKE value matching any text that contains the given text literally.
 * @param {string} text - The text to find
 * @returns {Object} The Sequelize literal to place under Op.like
 */
const containing = text => likePattern(`%${escapeLike(text)}%`);

/**
 * The LIKE value matching any text that starts with the given text literally.
 * @param {string} text - The leading text
 * @returns {Object} The Sequelize literal to place under Op.like
 */
const startingWith = text => likePattern(`${escapeLike(text)}%`);

export { escapeLike, likePattern, containing, startingWith };
