// utils/tonHandler.js
const axios = require('axios');
const User = require('../models/User');
const priceHandler = require('./priceHandler');

const TON_API_BASE_URL = process.env.TON_API_URL || 'https://tonapi.io/v2';
const APP_WALLET_ADDRESS = process.env.DEV_WALLET_ADDRESS;

if (!APP_WALLET_ADDRESS) {
  throw new Error('DEV_WALLET_ADDRESS is required');
}

/**
 * Normalize TON address (basic safety)
 */
function normalizeAddress(addr) {
  return addr?.toLowerCase()?.trim();
}

/**
 * Fetch transaction by hash
 */
async function fetchTransaction(txHash) {
  try {
    const { data } = await axios.get(
      `${TON_API_BASE_URL}/blockchain/transactions/${txHash}`,
      { timeout: 8000 }
    );
    return data;
  } catch (err) {
    console.error('TON fetch failed:', err.message);
    return null;
  }
}

/**
 * Verify TON payment
 */
async function verifyTransaction({
  telegramId,
  txHash,
  requiredUsd,
  minConfirmations = 1
}) {
  const tx = await fetchTransaction(txHash);
  if (!tx) return false;

  const outMsg = tx.out_msgs?.[0];
  if (!outMsg || !outMsg.value) {
    console.error('No outgoing payment');
    return false;
  }

  const destination = normalizeAddress(outMsg.destination?.address);
  if (!destination || destination !== normalizeAddress(APP_WALLET_ADDRESS)) {
    console.error('Invalid recipient');
    return false;
  }

  const amountTon = Number(outMsg.value) / 1e9;
  const expectedTon = await priceHandler.usdtToTon(requiredUsd);

  if (amountTon + 1e-6 < expectedTon) {
    console.error('Underpaid:', amountTon, '<', expectedTon);
    return false;
  }

  // Optional confirmation depth
  if (
    typeof tx.confirmations === 'number' &&
    tx.confirmations < minConfirmations
  ) {
    console.error('Not enough confirmations');
    return false;
  }

  // Persist transaction
  const user = await User.findOne({ telegramId });
  if (!user) return false;

  user.transactions = user.transactions || [];

  const exists = user.transactions.some(t => t.txHash === txHash);
  if (!exists) {
    user.transactions.push({
      txHash,
      amountTon,
      amountUsd: requiredUsd,
      status: 'confirmed',
      verifiedAt: new Date()
    });
    await user.save();
  }

  return true;
}

module.exports = {
  verifyTransaction,
  fetchTransaction
};
