// utils/tonHandler.js
const axios = require('axios');
const User = require('../models/User');
const priceHandler = require('./priceHandler');

const TON_API_BASE_URL = process.env.TON_API_URL || 'https://tonapi.io/v2';
const APP_WALLET_ADDRESS = process.env.DEV_WALLET_ADDRESS;

function normalizeAddress(addr) {
  return addr?.toLowerCase()?.trim();
}

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

async function verifyTonPayment(txHash, requiredUsd, recipientAddress, minConfirmations = 1) {
  const tx = await fetchTransaction(txHash);
  if (!tx) return false;

  const outMsg = tx.out_msgs?.[0];
  if (!outMsg || !outMsg.value) {
    console.error('No outgoing payment');
    return false;
  }

  const expectedRecipient = normalizeAddress(recipientAddress || APP_WALLET_ADDRESS);
  if (!expectedRecipient) {
    console.error('No recipient wallet configured');
    return false;
  }

  const destination = normalizeAddress(outMsg.destination?.address);
  if (!destination || destination !== expectedRecipient) {
    console.error('Invalid recipient');
    return false;
  }

  const amountTon = Number(outMsg.value) / 1e9;
  const expectedTon = await priceHandler.usdtToTon(requiredUsd, { allowStale: false });

  if (amountTon + 1e-6 < expectedTon) {
    console.error('Underpaid:', amountTon, '<', expectedTon);
    return false;
  }

  if (
    typeof tx.confirmations === 'number' &&
    tx.confirmations < minConfirmations
  ) {
    console.error('Not enough confirmations');
    return false;
  }

  return true;
}

async function verifyTransaction({
  telegramId,
  txHash,
  requiredUsd,
  minConfirmations = 1
}) {
  const paid = await verifyTonPayment(
    txHash,
    requiredUsd,
    APP_WALLET_ADDRESS,
    minConfirmations
  );

  if (!paid) return false;

  const user = await User.findOne({ telegramId });
  if (!user) return false;

  user.transactions = user.transactions || [];

  const exists = user.transactions.some((t) => t.txHash === txHash);
  if (!exists) {
    const tx = await fetchTransaction(txHash);
    const amountTon = tx?.out_msgs?.[0]?.value
      ? Number(tx.out_msgs[0].value) / 1e9
      : 0;

    user.transactions.push({
      txHash,
      expectedUsd: requiredUsd,
      amountTon,
      status: 'verified',
      createdAt: new Date()
    });
    await user.save();
  }

  return true;
}

module.exports = {
  verifyTransaction,
  verifyTonPayment,
  fetchTransaction
};
