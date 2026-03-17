const User = require('../models/User');
const Referral = require('../models/Referral');
const { getUserLevel } = require('./levelUtil');
const stateEmitter = require('./stateEmitter');

const INVITE_JOIN_BONUS_POINTS = 100;

function parseInviteCandidates(startParam) {
  if (!startParam || typeof startParam !== 'string') return [];
  const raw = startParam.trim();
  if (!raw) return [];

  const candidates = new Set([raw]);

  // common formats: "ref_<code>", "<telegramId>_<code>", "<telegramId>"
  const parts = raw.split(/[_:|-]/).filter(Boolean);
  for (const part of parts) candidates.add(part);

  // If token starts with numeric inviter id and has suffix, preserve id candidate.
  const leadingNumeric = raw.match(/^(\d{5,})/);
  if (leadingNumeric?.[1]) candidates.add(leadingNumeric[1]);

  return Array.from(candidates);
}

async function resolveInviterFromStartParam(startParam, currentTelegramId) {
  const candidates = parseInviteCandidates(startParam);
  if (!candidates.length) return null;

  // 1) Prefer inviteCode matches
  let inviter = await User.findOne({ inviteCode: { $in: candidates } });

  // 2) Fallback to numeric telegramId matches
  if (!inviter) {
    const numericCandidates = candidates
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));
    if (numericCandidates.length) {
      inviter = await User.findOne({ telegramId: { $in: numericCandidates } });
    }
  }

  if (!inviter) return null;
  if (Number(inviter.telegramId) === Number(currentTelegramId)) return null;
  return inviter;
}

async function applyReferralAttribution(user, startParam) {
  if (!user || user.invitedBy || !startParam) return { applied: false, reason: 'skip' };

  const inviter = await resolveInviterFromStartParam(startParam, user.telegramId);
  if (!inviter) return { applied: false, reason: 'inviter-not-found' };

  user.invitedBy = inviter.telegramId;
  user.points = (user.points || 0) + INVITE_JOIN_BONUS_POINTS;
  user.level = getUserLevel(user.points);
  await user.save();

  const referralResult = await Referral.updateOne(
    { invitedId: user.telegramId },
    {
      $setOnInsert: {
        inviterId: inviter.telegramId,
        invitedId: user.telegramId,
        joinedAt: new Date()
      }
    },
    { upsert: true }
  );
  const inserted = Number(referralResult?.upsertedCount || 0) > 0;

  if (inserted) {
    await User.updateOne(
      { telegramId: inviter.telegramId },
      { $inc: { invitedCount: 1 } }
    );

    const nextInvitedCount = (inviter.invitedCount || 0) + 1;
    stateEmitter.emit('user:updated', {
      telegramId: inviter.telegramId,
      points: inviter.points,
      xp: inviter.xp,
      level: inviter.level,
      nextLevelAt: inviter.nextLevelAt,
      bronzeTickets: inviter.bronzeTickets || 0,
      silverTickets: inviter.silverTickets || 0,
      goldTickets: inviter.goldTickets || 0,
      streak: inviter.streak || 0,
      miningStartedAt: inviter.miningStartedAt,
      invitedCount: nextInvitedCount
    });
  }

  return {
    applied: true,
    inviterTelegramId: inviter.telegramId,
    inviterUpdated: inserted ? 1 : 0
  };
}

module.exports = {
  applyReferralAttribution,
  resolveInviterFromStartParam,
  parseInviteCandidates
};
