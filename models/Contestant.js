const mongoose = require('mongoose');

const contestantSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, index: true },
  username: { type: String, default: null },
  wallet: { type: String, default: null },
  week: { type: String, required: true },
  enteredAt: { type: Date, default: Date.now }
});

contestantSchema.index({ telegramId: 1, week: 1 }, { unique: true });
contestantSchema.index({ week: 1, enteredAt: -1 });

module.exports = mongoose.models.Contestant
  || mongoose.model('Contestant', contestantSchema);
