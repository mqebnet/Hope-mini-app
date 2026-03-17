const mongoose = require('mongoose');

const contestantSchema = new mongoose.Schema({
  telegramId: { type: String, required: true },
  wallet: { type: String, default: null },
  week: { type: String, required: true }, // e.g., "Week 1", "Week 2", etc.
  enteredAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.Contestant || mongoose.model('Contestant', contestantSchema);
