const mongoose = require('mongoose');

// Main User Schema (lean core document; growing data is normalized into separate collections)
const UserSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true
  },

  username: { type: String, trim: true },
  isAdmin: { type: Boolean, default: false },

  points: { type: Number, default: 0, min: 0 },
  xp: { type: Number, default: 0, min: 0 },
  level: { type: String, default: 'Seeker' },

  streak: { type: Number, default: 0 },
  lastCheckInDate: { type: Date, default: null },

  wallet: {
    type: String,
    default: undefined,
    trim: true
  },

  inviteCode: { type: String, index: true, unique: true, sparse: true },
  invitedBy: { type: Number, default: null },
  invitedCount: { type: Number, default: 0 },

  inviteClaims: {
    one: Boolean,
    three: Boolean,
    five: Boolean,
    ten: Boolean
  },
  completedInviteTasks: { type: [Number], default: [] },
  gamePass: {
    validUntil: { type: Date, default: null },
    purchasedAt: { type: Date, default: null },
    txRef: { type: String, default: null }
  },

  miningStartedAt: Date,
  lastMiningClaim: Date,
  miningReminderSentAt: { type: Date, default: null },

  bronzeTickets: { type: Number, default: 0 },
  silverTickets: { type: Number, default: 0 },
  goldTickets: { type: Number, default: 0 }
}, { timestamps: true });

// generate a short unique code for referral/invite links
function _genCode() {
  // 4 random bytes -> 8 hex characters
  return require('crypto').randomBytes(4).toString('hex');
}

// ensure every new user gets a permanent, unique inviteCode
UserSchema.pre('save', async function(next) {
  if (this.isNew && !this.inviteCode) {
    let code;
    const User = mongoose.models.User;
    do {
      code = _genCode();
    } while (await User.exists({ inviteCode: code }));
    this.inviteCode = code;
  }
  next();
});

// Indexes
UserSchema.index({ telegramId: 1 }, { unique: true });
UserSchema.index(
  { wallet: 1 },
  {
    name: 'wallet_unique_nonempty',
    unique: true,
    partialFilterExpression: {
      wallet: { $type: 'string', $gt: '' }
    }
  }
);
UserSchema.index({ points: -1 });
UserSchema.index({ level: 1, xp: -1, points: -1 });
UserSchema.index({ miningStartedAt: 1 }, { sparse: true });
UserSchema.index({ invitedCount: -1 });
UserSchema.index({ invitedBy: 1 });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
