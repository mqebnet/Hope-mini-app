const mongoose = require('mongoose');

const ArcadeGameSessionSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    index: true
  },
  gameType: {
    type: String,
    enum: ['slidingtiles', 'blocktower', 'shellgame'],
    required: true,
    index: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'normal', 'hard'],
    default: 'normal'
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned', 'expired'],
    default: 'active'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  playStartsAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  timeLimitSeconds: {
    type: Number,
    required: true
  },
  timeUsedSeconds: {
    type: Number,
    default: 0
  },
  moveCount: {
    type: Number,
    default: 0
  },
  mistakes: {
    type: Number,
    default: 0
  },
  reward: {
    points: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    bronzeTickets: { type: Number, default: 0 },
    silverTickets: { type: Number, default: 0 },
    goldTickets: { type: Number, default: 0 },
    earnedAt: { type: Date, default: null }
  },
  rewardClaimed: {
    type: Boolean,
    default: false
  },
  state: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  },
  metrics: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  }
}, { timestamps: true });

ArcadeGameSessionSchema.index({ telegramId: 1, gameType: 1, status: 1 });

module.exports = mongoose.models.ArcadeGameSession || mongoose.model('ArcadeGameSession', ArcadeGameSessionSchema);
