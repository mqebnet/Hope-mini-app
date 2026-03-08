const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema({
  inviterId: { type: Number, required: true, index: true },
  invitedId: { type: Number, required: true, index: true },
  joinedAt: { type: Date, default: Date.now }
}, {
  versionKey: false,
  collection: 'referrals'
});

ReferralSchema.index({ inviterId: 1, joinedAt: -1 });
ReferralSchema.index({ invitedId: 1 }, { unique: true });
ReferralSchema.index({ inviterId: 1, invitedId: 1 }, { unique: true });

module.exports = mongoose.models.Referral || mongoose.model('Referral', ReferralSchema);
