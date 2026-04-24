const mongoose = require('mongoose');

const DailyTaskCompletionSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  taskId: { type: String, required: true, trim: true },
  dayKey: { type: String, required: true, trim: true, index: true },
  completedAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  collection: 'dailyTaskCompletions'
});

DailyTaskCompletionSchema.index({ telegramId: 1, taskId: 1, dayKey: 1 }, { unique: true });
DailyTaskCompletionSchema.index({ telegramId: 1, dayKey: 1, completedAt: -1 });

module.exports = mongoose.models.DailyTaskCompletion
  || mongoose.model('DailyTaskCompletion', DailyTaskCompletionSchema);
