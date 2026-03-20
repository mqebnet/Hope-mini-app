const mongoose = require('mongoose');

const PendingTaskVerificationSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  taskId: { type: String, required: true, trim: true },
  submittedAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  collection: 'pendingTaskVerifications'
});

PendingTaskVerificationSchema.index(
  { telegramId: 1, taskId: 1 },
  { unique: true }
);

module.exports = mongoose.models.PendingTaskVerification
  || mongoose.model('PendingTaskVerification', PendingTaskVerificationSchema);
