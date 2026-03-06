const crypto = require('crypto');
const User = require('../models/User');

/**
 * Generate a random 8-character hex invite code
 * @returns {string} Random hex string (8 chars)
 */
function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Generate a unique invite code, retrying until a non-duplicate is found
 * @async
 * @returns {Promise<string>} Unique invite code guaranteed not to exist in DB
 * @throws {Error} If database query fails
 */
async function generateUniqueInviteCode() {
  let code;
  do {
    code = generateInviteCode();
  } while (await User.exists({ inviteCode: code }));
  return code;
}

module.exports = {
  generateInviteCode,
  generateUniqueInviteCode
};
