const mongoose = require('mongoose');

const CheckInSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  dayKey: { type: String, required: true },
  txHash: { type: String, default: null },
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  collection: 'checkins'
});

CheckInSchema.index({ telegramId: 1, dayKey: 1 }, { unique: true });
CheckInSchema.index({ telegramId: 1, txHash: 1 }, { unique: true, sparse: true });
CheckInSchema.index({ telegramId: 1, createdAt: -1 });

module.exports = mongoose.models.CheckIn || mongoose.model('CheckIn', CheckInSchema);
