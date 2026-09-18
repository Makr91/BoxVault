const NAME_MEMBERS = {
  given_name: 'givenName',
  family_name: 'familyName',
  middle_name: 'middleName',
};

const ADDRESS_MEMBERS = {
  line1: 'addressLine1',
  city: 'addressCity',
  state: 'addressState',
  postal_code: 'addressPostalCode',
  country: 'addressCountry',
  formatted: 'addressFormatted',
};

const PROFILE_MEMBERS = [...Object.keys(NAME_MEMBERS), 'mobile_number', 'address'];

const isClearing = value => value === null || value === '';

const cleaned = value => (isClearing(value) ? null : String(value).trim() || null);

/**
 * The RFC 7643 §4.1.1 and §4.1.2 core attributes of a user in the identity
 * contract's names: the three name parts, the mobile number with its
 * verified flag, and the home address; a member the user has no value for
 * is null.
 * @param {Object} user - The user row
 * @returns {{given_name: string|null, family_name: string|null, middle_name: string|null, mobile_number: {value: string, verified: boolean}|null, address: Object|null}}
 */
const profileOf = user => {
  const address = Object.fromEntries(
    Object.entries(ADDRESS_MEMBERS).map(([member, column]) => [member, user[column] ?? null])
  );
  return {
    ...Object.fromEntries(
      Object.entries(NAME_MEMBERS).map(([member, column]) => [member, user[column] ?? null])
    ),
    mobile_number: user.mobileNumber
      ? { value: user.mobileNumber, verified: user.mobileNumberVerified === true }
      : null,
    address: Object.values(address).some(value => value !== null) ? address : null,
  };
};

/**
 * The column patch a JSON Merge Patch (RFC 7396) over the profile members
 * makes: a member absent is untouched, null or blank clears it, an address
 * object merges member by member and a null address clears every part.
 * @param {Object} body - The request body
 * @returns {Object} The Sequelize update patch
 */
const profilePatchOf = body => {
  const patch = {};
  Object.entries(NAME_MEMBERS).forEach(([member, column]) => {
    if (Object.hasOwn(body, member)) {
      patch[column] = cleaned(body[member]);
    }
  });
  if (Object.hasOwn(body, 'mobile_number')) {
    patch.mobileNumber = cleaned(body.mobile_number);
    patch.mobileNumberVerified = patch.mobileNumber ? false : null;
  }
  if (Object.hasOwn(body, 'address')) {
    const address = body.address && typeof body.address === 'object' ? body.address : {};
    Object.entries(ADDRESS_MEMBERS).forEach(([member, column]) => {
      if (body.address === null || Object.hasOwn(address, member)) {
        patch[column] = body.address === null ? null : cleaned(address[member]);
      }
    });
  }
  return patch;
};

export { PROFILE_MEMBERS, NAME_MEMBERS, ADDRESS_MEMBERS, profileOf, profilePatchOf };
