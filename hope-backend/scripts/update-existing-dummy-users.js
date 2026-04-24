#!/usr/bin/env node

const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const User = require('../models/User');

const DUMMY_ID_MIN = 9_900_000_001;
const DUMMY_ID_MAX = 9_900_999_999;

const LEVEL_XP_RANGES = {
  Seeker: { min: 25, max: 200 },
  Dreamer: { min: 201, max: 900 },
  Believer: { min: 901, max: 2_500 },
  Challenger: { min: 2_501, max: 5_000 },
  Navigator: { min: 5_001, max: 9_000 },
  Ascender: { min: 9_001, max: 14_000 },
  Master: { min: 14_001, max: 19_000 },
  Grandmaster: { min: 19_001, max: 24_000 },
  Legend: { min: 24_001, max: 28_000 },
  Eldrin: { min: 28_001, max: 30_000 }
};

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in hope-backend/.env');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000
  });
}

async function main() {
  await connectDB();
  console.log('Connected to MongoDB');

  const dummyUsers = await User.find({
    telegramId: { $gte: DUMMY_ID_MIN, $lte: DUMMY_ID_MAX }
  })
    .select('_id telegramId username level xp miningStartedAt')
    .lean();

  if (!dummyUsers.length) {
    console.log('No existing dummy users found.');
    return;
  }

  let miningClearedCount = 0;
  const bulkOps = dummyUsers.map((user) => {
    const xpRange = LEVEL_XP_RANGES[user.level] || LEVEL_XP_RANGES.Seeker;
    if (user.miningStartedAt) miningClearedCount += 1;

    return {
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: { xp: rnd(xpRange.min, xpRange.max) },
          $unset: { miningStartedAt: '' }
        }
      }
    };
  });

  const result = await User.bulkWrite(bulkOps, { ordered: false });

  console.log(`Updated ${result.modifiedCount || 0} existing dummy users.`);
  console.log(`Cleared miningStartedAt on ${miningClearedCount} dummy users.`);
}

main()
  .catch((err) => {
    console.error('\nDummy user update failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
