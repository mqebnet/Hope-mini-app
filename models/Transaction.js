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
  rewardStatus: {
    type: String,
    enum: ['pending', 'processing', 'applied', 'skipped', 'failed'],
    default: 'pending'
  },
  rewardedAt: { type: Date, default: null },
  reconcileAttempts: { type: Number, default: 0 },
  reconcileLockedAt: { type: Date, default: null },
  lastReconcileError: { type: String, default: null },
  rewardMeta: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  collection: 'transactions'
});

TransactionSchema.index({ telegramId: 1, createdAt: -1 });
TransactionSchema.index({ txHash: 1 }, { unique: true });
TransactionSchema.index({ telegramId: 1, status: 1, rewardStatus: 1, createdAt: -1 });

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);
