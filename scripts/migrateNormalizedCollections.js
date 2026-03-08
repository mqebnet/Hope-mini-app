/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Referral = require('../models/Referral');
const CompletedTask = require('../models/CompletedTask');
const CheckIn = require('../models/CheckIn');
const MysteryBox = require('../models/MysteryBox');
const UserBadge = require('../models/UserBadge');
const ProcessedTransaction = require('../models/ProcessedTransaction');
const User = require('../models/User');

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI missing in environment');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const usersCollection = mongoose.connection.collection('users');
  const cursor = usersCollection.find({});

  let processedUsers = 0;
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const telegramId = Number(doc?.telegramId);
    if (!Number.isFinite(telegramId)) continue;

    const txOps = toArray(doc.transactions).map((tx) => ({
      updateOne: {
        filter: { txHash: tx?.txHash },
        update: {
          $setOnInsert: {
            telegramId,
            txHash: tx?.txHash,
            createdAt: tx?.createdAt ? new Date(tx.createdAt) : new Date()
          },
          $set: {
            purpose: tx?.purpose || 'payment',
            taskId: tx?.taskId || null,
            expectedUsd: Number(tx?.expectedUsd || 0),
            amountTon: tx?.amountTon == null ? null : Number(tx.amountTon),
            status: tx?.status || 'pending'
          }
        },
        upsert: true
      }
    })).filter((op) => op.updateOne.filter.txHash);

    if (txOps.length) {
      await Transaction.bulkWrite(txOps, { ordered: false });
    }

    const processedTxOps = toArray(doc.processedTransactions).map((txHash) => ({
      updateOne: {
        filter: { txHash: String(txHash) },
        update: {
          $setOnInsert: {
            telegramId,
            txHash: String(txHash),
            processedAt: new Date()
          }
        },
        upsert: true
      }
    }));
    if (processedTxOps.length) {
      await ProcessedTransaction.bulkWrite(processedTxOps, { ordered: false });
    }

    const referralOps = toArray(doc.referrals).map((ref) => ({
      updateOne: {
        filter: { invitedId: Number(ref?.userId) },
        update: {
          $setOnInsert: {
            inviterId: telegramId,
            invitedId: Number(ref?.userId),
            joinedAt: ref?.joinedAt ? new Date(ref.joinedAt) : new Date()
          }
        },
        upsert: true
      }
    })).filter((op) => Number.isFinite(op.updateOne.filter.invitedId));
    if (referralOps.length) {
      await Referral.bulkWrite(referralOps, { ordered: false });
    }

    const completedTaskOps = toArray(doc.completedTasks).map((taskId) => ({
      updateOne: {
        filter: { telegramId, taskId: String(taskId) },
        update: {
          $setOnInsert: {
            telegramId,
            taskId: String(taskId),
            completedAt: new Date()
          }
        },
        upsert: true
      }
    }));
    if (completedTaskOps.length) {
      await CompletedTask.bulkWrite(completedTaskOps, { ordered: false });
    }

    const checkInOps = toArray(doc.checkIns).map((checkIn) => ({
      updateOne: {
        filter: { telegramId, dayKey: String(checkIn?.dayKey) },
        update: {
          $setOnInsert: {
            telegramId,
            dayKey: String(checkIn?.dayKey),
            txHash: checkIn?.txHash || null,
            verified: Boolean(checkIn?.verified),
            createdAt: checkIn?.createdAt ? new Date(checkIn.createdAt) : new Date()
          }
        },
        upsert: true
      }
    })).filter((op) => op.updateOne.filter.dayKey && op.updateOne.filter.dayKey !== 'undefined');
    if (checkInOps.length) {
      await CheckIn.bulkWrite(checkInOps, { ordered: false });
    }

    const badgeOps = toArray(doc.badges).map((badge) => ({
      updateOne: {
        filter: { telegramId, badge: String(badge) },
        update: {
          $setOnInsert: {
            telegramId,
            badge: String(badge),
            awardedAt: new Date()
          }
        },
        upsert: true
      }
    }));
    if (badgeOps.length) {
      await UserBadge.bulkWrite(badgeOps, { ordered: false });
    }

    const mysteryOps = toArray(doc.mysteryBoxes).map((box) => {
      const txKey = box?.transactionId || `${telegramId}:${box?._id || Math.random()}`;
      return {
      updateOne: {
        filter: {
          telegramId,
          transactionId: txKey
        },
        update: {
          $setOnInsert: {
            telegramId,
            boxType: box?.boxType || 'bronze',
            status: box?.status || 'purchased',
            purchaseTime: box?.purchaseTime ? new Date(box.purchaseTime) : new Date(),
            transactionId: txKey,
            claimedAt: box?.claimedAt ? new Date(box.claimedAt) : null,
            reward: {
              points: Number(box?.reward?.points || 0),
              bronzeTickets: Number(box?.reward?.bronzeTickets || 0),
              silverTickets: Number(box?.reward?.silverTickets || 0),
              goldTickets: Number(box?.reward?.goldTickets || 0),
              xp: Number(box?.reward?.xp || 0)
            }
          }
        },
        upsert: true
      }
    };
    });
    if (mysteryOps.length) {
      await MysteryBox.bulkWrite(mysteryOps, { ordered: false });
    }

    const normalizedInvitedCount = await Referral.countDocuments({ inviterId: telegramId });
    if (normalizedInvitedCount !== Number(doc.invitedCount || 0)) {
      await User.updateOne(
        { telegramId },
        { $set: { invitedCount: normalizedInvitedCount } }
      );
    }

    processedUsers += 1;
    if (processedUsers % 200 === 0) {
      console.log(`Processed ${processedUsers} users`);
    }
  }

  console.log(`Migration completed. Users scanned: ${processedUsers}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
