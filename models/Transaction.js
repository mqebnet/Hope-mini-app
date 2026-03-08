const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  txHash: { type: String, required: true, trim: true },
  purpose: { type: String, default: 'payment' },
  taskId: { type: String, default: null },
  expectedUsd: { type: Number, default: 0 },
  amountTon: { type: Number, default: null },
  status: {
    type: String,
    enum: ['pending', 'verified', 'failed'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  collection: 'transactions'
});

TransactionSchema.index({ telegramId: 1, createdAt: -1 });
TransactionSchema.index({ txHash: 1 }, { unique: true });

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
