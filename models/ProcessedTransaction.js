const mongoose = require('mongoose');

const ProcessedTransactionSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  txHash: { type: String, required: true, trim: true },
  processedAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  collection: 'processedTransactions'
});

ProcessedTransactionSchema.index({ telegramId: 1, processedAt: -1 });
ProcessedTransactionSchema.index({ txHash: 1 }, { unique: true });

module.exports = mongoose.models.ProcessedTransaction || mongoose.model('ProcessedTransaction', ProcessedTransactionSchema);
