const mongoose = require('mongoose');

// Schema for daily check-ins
const checkInSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  verified: { type: Boolean, default: false }
}, { _id: false });

// Schema for mystery boxes (for the puzzle game)
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
  points: { 
    type: Number, 
    default: 0, 
    min: 0 
  },
  level: { type: String, default: "Seeker" },
  xp: { type: Number, default: 0, min: 0 },
streak: {
  type: Number,
  default: 0
},
lastCheckInDate: {
  type: Date,
  default: null
},

wallet: { type: String, default: null },
  
transactions: {
  type: [
    {
      txHash: { type: String, required: true },
      purpose: { type: String },
      taskId: { type: String },
      expectedUsd: { type: Number },
      amountTon: { type: Number },
      status: {
        type: String,
        enum: ['pending', 'verified', 'failed'],
        default: 'pending'
      },
      timestamp: { type: Date, default: Date.now },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  default: []
},

  completedTasks: [{ type: String }], // Stores task IDs
  dailyCheckins: [{ type: Date }],
  
  referrals: [{
    userId: String,
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  inviteCode: { type: String, unique: true },
invitedBy: { type: String, default: null },
referralsCount: { type: Number, default: 0 },
inviteClaims: {
  one: { type: Boolean, default: false },
  three: { type: Boolean, default: false },
  five: { type: Boolean, default: false },
  ten: { type: Boolean, default: false }
},

  invitedCount: {
    type: Number,
    default: 0
  },
  completedInviteTasks: [Number],
  completedPuzzles: [String],
  lastMiningClaim: Date,

  miningStartedAt: {
  type: Date,
  default: null
},
miningDurationMs: {
  type: Number,
  default: null
},
  processedTransactions: { 
    type: [String], 
    default: [] 
  },
  bronzeTickets: { type: Number, default: 0, min: 0 },
  silverTickets: { type: Number, default: 0, min: 0 },
  goldTickets: { type: Number, default: 0, min: 0 },

checkIns: [
  {
    dayKey: {
      type: String,
      required: true
    },
    txHash: {
      type: String,
      required: true
    },
    verified: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }
],

  mysteryBoxes: { type: [mysteryBoxSchema], default: [] }
}, { timestamps: true });

// Indexes
UserSchema.index({ level: 1, points: -1 }); // For main leaderboard
UserSchema.index({ invitedCount: -1 }); // For referral leaderboard (changed from 'referrals' to 'invitedCount')
UserSchema.index(
  { telegramId: 1, 'checkIns.dayKey': 1 },
  { unique: true, sparse: true }
);

// Check if model already exists before compiling
module.exports = mongoose.models.User || mongoose.model('User', UserSchema); 