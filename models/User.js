const mongoose = require('mongoose');

// Mystery box schema
const mysteryBoxSchema = new mongoose.Schema({
  boxType: { type: String, enum: ['bronze', 'silver', 'gold'], required: true },
  status: { type: String, enum: ['purchased', 'opened', 'claimed'], default: 'purchased' },
  purchaseTime: { type: Date, default: Date.now },
  transactionId: { type: String },
  puzzle: {
    meme: String,
    totalPieces: Number,
    openedAt: Date
  }
}, { _id: false });

// Main User Schema
const UserSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },

  username: String,

  points: { type: Number, default: 0, min: 0 },
  xp: { type: Number, default: 0, min: 0 },
  level: { type: String, default: 'Seeker' },

  streak: { type: Number, default: 0 },
  lastCheckInDate: { type: Date, default: null },

  wallet: { type: String, default: null },

  transactions: {
    type: [{
      txHash: { type: String, index: true },
      purpose: String,
      taskId: String,
      expectedUsd: Number,
      amountTon: Number,
      status: {
        type: String,
        enum: ['pending', 'verified', 'failed'],
        default: 'pending'
      },
      createdAt: { type: Date, default: Date.now }
    }],
    default: []
  },

  completedTasks: [String],

  referrals: [{
    userId: { type: Number, required: true },
    joinedAt: { type: Date, default: Date.now }
  }],

  inviteCode: { type: String, index: true, unique: true },
  invitedBy: { type: Number, default: null },
  invitedCount: { type: Number, default: 0 },

  inviteClaims: {
    one: Boolean,
    three: Boolean,
    five: Boolean,
    ten: Boolean
  },

  miningStartedAt: Date,
  lastMiningClaim: Date,

  processedTransactions: { type: [String], default: [] },

  bronzeTickets: { type: Number, default: 0 },
  silverTickets: { type: Number, default: 0 },
  goldTickets: { type: Number, default: 0 },

  checkIns: [{
    dayKey: { type: String, required: true },
    txHash: { type: String },
    verified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],

  badges: { type: [String], default: [] },

  mysteryBoxes: { type: [mysteryBoxSchema], default: [] }
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
UserSchema.index({ level: 1, points: -1 });
UserSchema.index({ invitedCount: -1 });

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
