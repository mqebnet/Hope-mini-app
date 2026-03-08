const mongoose = require('mongoose');

const MysteryBoxSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  boxType: { type: String, enum: ['bronze', 'silver', 'gold'], required: true },
  status: { type: String, enum: ['purchased', 'claimed'], default: 'purchased' },
  purchaseTime: { type: Date, default: Date.now },
  transactionId: { type: String, default: undefined },
  claimedAt: { type: Date, default: null },
  reward: {
    points: { type: Number, default: 0 },
    bronzeTickets: { type: Number, default: 0 },
    silverTickets: { type: Number, default: 0 },
    goldTickets: { type: Number, default: 0 },
    xp: { type: Number, default: 0 }
  }
}, {
  versionKey: false,
  collection: 'mysteryBoxes'
});

MysteryBoxSchema.index({ telegramId: 1, purchaseTime: -1 });
MysteryBoxSchema.index({ telegramId: 1, status: 1, purchaseTime: -1 });
MysteryBoxSchema.index({ transactionId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.models.MysteryBox || mongoose.model('MysteryBox', MysteryBoxSchema);
