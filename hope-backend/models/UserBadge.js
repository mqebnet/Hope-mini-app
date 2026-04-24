const mongoose = require('mongoose');

const UserBadgeSchema = new mongoose.Schema({
  telegramId: { type: Number, required: true, index: true },
  badge: { type: String, required: true, trim: true },
  awardedAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  collection: 'userBadges'
});

UserBadgeSchema.index({ telegramId: 1, badge: 1 }, { unique: true });
UserBadgeSchema.index({ telegramId: 1, awardedAt: -1 });

module.exports = mongoose.models.UserBadge || mongoose.model('UserBadge', UserBadgeSchema);
