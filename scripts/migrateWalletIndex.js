/* eslint-disable no-console */
require('dotenv').config();
const mongoose = require('mongoose');

const TARGET_INDEX_NAME = 'wallet_unique_nonempty';
const TARGET_INDEX_SPEC = {
  key: { wallet: 1 },
  options: {
    name: TARGET_INDEX_NAME,
    unique: true,
    partialFilterExpression: {
      wallet: { $type: 'string', $gt: '' }
    }
  }
};

function isWalletIndex(index) {
  if (!index || typeof index !== 'object') return false;
  const key = index.key || {};
  const keys = Object.keys(key);
  return keys.length === 1 && key.wallet === 1;
}

function hasTargetWalletSpec(index) {
  if (!isWalletIndex(index)) return false;
  if (index.name !== TARGET_INDEX_NAME) return false;
  if (index.unique !== true) return false;
  const walletFilter = index.partialFilterExpression?.wallet;
  return walletFilter?.$type === 'string' && walletFilter?.$gt === '';
}

async function normalizeWalletField(users) {
  const unsetNull = await users.updateMany(
    { wallet: null },
    { $unset: { wallet: '' } }
  );
  const unsetEmpty = await users.updateMany(
    { wallet: '' },
    { $unset: { wallet: '' } }
  );
  return {
    unsetNull: Number(unsetNull.modifiedCount || 0),
    unsetEmpty: Number(unsetEmpty.modifiedCount || 0)
  };
}

async function findDuplicateWallets(users, limit = 20) {
  return users.aggregate([
    { $match: { wallet: { $type: 'string', $gt: '' } } },
    {
      $group: {
        _id: '$wallet',
        count: { $sum: 1 },
        sampleUserIds: { $push: '$_id' }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]).toArray();
}

async function ensureWalletIndex(users) {
  const before = await users.indexes();
  const walletIndexes = before.filter(isWalletIndex);
  const targetAlreadyCorrect = walletIndexes.some(hasTargetWalletSpec);

  let dropped = 0;
  if (!targetAlreadyCorrect || walletIndexes.length > 1) {
    for (const idx of walletIndexes) {
      if (hasTargetWalletSpec(idx) && walletIndexes.length === 1) continue;
      await users.dropIndex(idx.name);
      dropped += 1;
    }
  }

  const createdName = await users.createIndex(
    TARGET_INDEX_SPEC.key,
    TARGET_INDEX_SPEC.options
  );

  const after = await users.indexes();
  const hasTarget = after.some(hasTargetWalletSpec);
  if (!hasTarget) {
    throw new Error('Failed to verify wallet_unique_nonempty index after creation');
  }

  return {
    droppedWalletIndexes: dropped,
    createdOrEnsuredIndex: createdName,
    walletIndexesAfter: after.filter(isWalletIndex).map((idx) => idx.name)
  };
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI missing in environment');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const users = mongoose.connection.collection('users');

  const normalization = await normalizeWalletField(users);
  const duplicates = await findDuplicateWallets(users, 20);
  if (duplicates.length > 0) {
    console.error('[wallet-index-migration] Duplicate non-empty wallet values detected. Resolve these first.');
    console.error(JSON.stringify(duplicates, null, 2));
    throw new Error('Duplicate wallet values found');
  }

  const indexResult = await ensureWalletIndex(users);
  console.log(JSON.stringify({
    ok: true,
    normalization,
    indexResult
  }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('[wallet-index-migration] failed:', err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
