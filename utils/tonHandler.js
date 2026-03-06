// utils/tonHandler.js
const axios = require('axios');
const { Cell, Address } = require('@ton/core');
const User = require('../models/User');
const priceHandler = require('./priceHandler');

/** @type {string} TON API base URL for blockchain queries */
const TON_API_BASE_URL = process.env.TON_API_URL || 'https://tonapi.io/v2';

/** @type {string} Developer's wallet address for receiving payments */
const APP_WALLET_ADDRESS = process.env.DEV_WALLET_ADDRESS || process.env.TON_WALLET_ADDRESS || '';

/**
 * Normalize a TON address to canonical raw format for comparison
 * @param {string} addr - Raw or friendly TON address
 * @returns {string|null} Canonical address string or null if invalid
 */
function normalizeAddress(addr) {
  if (!addr || typeof addr !== 'string') return null;
  const trimmed = addr.trim();
  try {
    // Compare on canonical raw format to avoid friendly/raw mismatch.
    return Address.parse(trimmed).toRawString();
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * Fetch a transaction from TON blockchain API by hash
 * @async
 * @param {string} txHash - Transaction hash to look up
 * @returns {Promise<Object|null>} Transaction object or null if not found/error
 */
async function fetchTransaction(txHash) {
  if (!txHash) return null;
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

function toMessageHashFromBoc(boc) {
  if (!boc || typeof boc !== 'string') return null;
  try {
    const cell = Cell.fromBase64(boc);
    return cell.hash();
  } catch {
    return null;
  }
}

function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildMessageHashCandidates(messageHash) {
  if (!messageHash) return [];
  if (Buffer.isBuffer(messageHash)) {
    return [toBase64Url(messageHash), messageHash.toString('hex')];
  }
  const text = String(messageHash).trim();
  if (!text) return [];
  return [text];
}

async function fetchTransactionByMessageHash(messageHash) {
  const candidates = buildMessageHashCandidates(messageHash);
  if (!candidates.length) return null;

  for (const candidate of candidates) {
    try {
      const { data } = await axios.get(
        `${TON_API_BASE_URL}/blockchain/messages/${candidate}/transaction`,
        { timeout: 8000 }
      );
      if (data?.out_msgs) return data;
      if (data?.transaction?.out_msgs) return data.transaction;
      if (data?.tx?.out_msgs) return data.tx;

      const nextTxHash = data?.hash || data?.tx_hash || data?.transaction_hash || null;
      if (nextTxHash) {
        const tx = await fetchTransaction(nextTxHash);
        if (tx) return tx;
      }
    } catch (err) {
      if (err?.response?.status !== 404) {
        console.error('TON fetch by message hash failed:', err.message);
      }
    }

    try {
      const { data } = await axios.get(
        `${TON_API_BASE_URL}/blockchain/messages/${candidate}`,
        { timeout: 8000 }
      );
      const nextTxHash =
        data?.tx_hash ||
        data?.transaction_hash ||
        data?.transaction?.hash ||
        data?.hash ||
        null;
      if (nextTxHash) {
        const tx = await fetchTransaction(nextTxHash);
        if (tx) return tx;
      }
    } catch (err) {
      if (err?.response?.status !== 404) {
        console.error('TON fetch message object failed:', err.message);
      }
    }
  }

  return null;
}

async function resolveTransaction({ txHash, txBoc }) {
  const explicitTxHash = typeof txHash === 'string' ? txHash.trim() : '';
  const explicitBoc = typeof txBoc === 'string' ? txBoc.trim() : '';

  let tx = await fetchTransaction(explicitTxHash);
  if (tx) {
    return {
      tx,
      txRef: explicitTxHash
    };
  }

  const bocSource = explicitBoc || explicitTxHash;
  const messageHash = toMessageHashFromBoc(bocSource);
  if (!messageHash) {
    return { tx: null, txRef: null };
  }

  tx = await fetchTransactionByMessageHash(messageHash);
  if (!tx) {
    return { tx: null, txRef: null };
  }

  return {
    tx,
    txRef:
      tx.hash ||
      tx.transaction_id?.hash ||
      (Buffer.isBuffer(messageHash) ? toBase64Url(messageHash) : String(messageHash))
  };
}

async function resolveTransactionWithRetry({ txHash, txBoc, timeoutMs = 45000, intervalMs = 3000 }) {
  const deadline = Date.now() + timeoutMs;
  let lastResolved = { tx: null, txRef: null };

  while (Date.now() <= deadline) {
    // eslint-disable-next-line no-await-in-loop
    lastResolved = await resolveTransaction({ txHash, txBoc });
    if (lastResolved.tx) {
      return lastResolved;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return lastResolved;
}

/**
 * Verify that a TON payment meets the required amount for a specified recipient
 * Legacy function; verifyTransaction() is preferred for full workflow
 * @async
 * @param {string} txHash - Transaction hash
 * @param {number} requiredUsd - Required amount in USDT
 * @param {string} recipientAddress - Expected recipient wallet
 * @param {number} [minConfirmations=1] - Minimum confirmations required
 * @returns {Promise<boolean>} True if payment verified, false otherwise
 */
async function verifyTonPayment(txHash, requiredUsd, recipientAddress, minConfirmations = 1) {
  const resolved = await resolveTransaction({ txHash });
  const tx = resolved.tx;
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

/**
 * **MAIN PAYMENT VERIFICATION FUNCTION**
 * Verify an on-chain TON transaction meets all requirements:
 * - Transaction exists and is sufficiently confirmed
 * - Recipient is the app's wallet
 * - Amount is >= required USDT equivalent in TON
 * - User exists and transaction hasn't been used before
 *
 * Automatically retries with polling for up to 45 seconds
 * Stores verified transaction in user's transaction log
 *
 * @async
 * @param {Object} options - Verification parameters
 * @param {number} options.telegramId - User's Telegram ID
 * @param {string} [options.txHash] - Transaction hash
 * @param {string} [options.txBoc] - Bag of Cells (if hash not provided)
 * @param {string} [options.purpose] - Purpose label ('daily-checkin', 'mystery-box-purchase', etc.)
 * @param {number} options.requiredUsd - Required amount in USD/USDT
 * @param {number} [options.minConfirmations=1] - Min confirmations required
 * @returns {Promise<{ok: boolean, reason?: string, txRef?: string}>}
 *   On success: {ok: true, txRef: 'hash'}
 *   On failure: {ok: false, reason: 'error message'}
 * @example
 * const result = await verifyTransaction({
 *   telegramId: 123456,
 *   txHash: '...',
 *   purpose: 'daily-checkin',
 *   requiredUsd: 0.3
 * });
 * if (result.ok) { // Award user
 */
async function verifyTransaction({
  telegramId,
  txHash,
  txBoc,
  purpose = 'payment',
  requiredUsd,
  minConfirmations = 1
}) {
  const resolved = await resolveTransactionWithRetry({ txHash, txBoc });
  const tx = resolved.tx;
  if (!tx) return { ok: false, reason: 'Transaction proof not found on chain' };

  const outMsg = tx.out_msgs?.[0];
  if (!outMsg || !outMsg.value) {
    return { ok: false, reason: 'No outgoing payment found' };
  }

  const expectedRecipient = normalizeAddress(APP_WALLET_ADDRESS);
  if (!expectedRecipient) {
    return { ok: false, reason: 'Recipient wallet is not configured' };
  }

  const destination = normalizeAddress(outMsg.destination?.address);
  if (!destination || destination !== expectedRecipient) {
    return {
      ok: false,
      reason: `Invalid recipient address (expected ${expectedRecipient}, got ${destination || 'none'})`
    };
  }

  const amountTon = Number(outMsg.value) / 1e9;
  const expectedTon = await priceHandler.usdtToTon(requiredUsd, { allowStale: false });
  if (amountTon + 1e-6 < expectedTon) {
    return { ok: false, reason: 'Transaction amount below required value' };
  }

  if (
    typeof tx.confirmations === 'number' &&
    tx.confirmations < minConfirmations
  ) {
    return { ok: false, reason: 'Transaction not sufficiently confirmed' };
  }

  const user = await User.findOne({ telegramId });
  if (!user) return { ok: false, reason: 'User not found' };

  user.transactions = user.transactions || [];
  const txRef = resolved.txRef || txHash || (() => {
    const messageHash = toMessageHashFromBoc(txBoc);
    if (!messageHash) return null;
    return Buffer.isBuffer(messageHash) ? toBase64Url(messageHash) : String(messageHash);
  })() || txBoc;
  if (!txRef) return { ok: false, reason: 'Unable to derive transaction reference' };

  const exists = user.transactions.some((t) => t.txHash === txRef);
  if (!exists) {
    user.transactions.push({
      txHash: txRef,
      purpose,
      expectedUsd: requiredUsd,
      amountTon,
      status: 'verified',
      createdAt: new Date()
    });
    await user.save();
  }

  return { ok: true, txRef };
}

module.exports = {
  verifyTransaction,
  verifyTonPayment,
  fetchTransaction
};
