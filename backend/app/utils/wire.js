const isPlainObject = value => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const toSnakeKey = key => {
  if (key.includes('_') || !/[A-Z]/.test(key)) {
    return key;
  }
  return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
};

/**
 * Deep-convert the keys of plain objects and arrays from camelCase to
 * snake_case. A key already containing `_`, or with no uppercase letter, is
 * left unchanged. `Date`, `Buffer`, `null` and every primitive pass through
 * untouched; only plain objects and arrays recurse.
 * @param {*} value - The value to convert.
 * @returns {*} The value with every key snake_cased.
 */
const snakeKeys = value => {
  if (Array.isArray(value)) {
    return value.map(snakeKeys);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [toSnakeKey(key), snakeKeys(entry)])
    );
  }
  return value;
};

export { snakeKeys };
