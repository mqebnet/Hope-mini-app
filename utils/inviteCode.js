const crypto = require('crypto');
const User = require('../models/User');

// simple random generator; length eight hex characters
function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex');
}

// create a new unique code by checking the DB; loops until unique found
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
