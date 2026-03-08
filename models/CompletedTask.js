const mongoose = require('mongoose');

const CompletedTaskSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  taskId: { type: String, required: true, trim: true },
  completedAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  collection: 'completedTasks'
});

CompletedTaskSchema.index({ telegramId: 1, taskId: 1 }, { unique: true });
CompletedTaskSchema.index({ telegramId: 1, completedAt: -1 });

module.exports = mongoose.models.CompletedTask || mongoose.model('CompletedTask', CompletedTaskSchema);
