const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const WebAccount = require('../models/WebAccount');

const router = express.Router();
const GMAIL_REGEX = /^[A-Z0-9._%+-]+@gmail\.com$/i;

function getCookieOptions(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const viaHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    sameSite: viaHttps ? 'none' : 'lax',
    secure: viaHttps || isProd,
    path: '/'
  };
}

function normalizeGmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!GMAIL_REGEX.test(value)) return null;
  return value;
}

function normalizeWallet(wallet) {
  const raw = String(wallet || '').trim();
  if (!raw) return null;
  try {
    const { Address } = require('@ton/core');
    return Address.parse(raw).toString({ bounceable: false });
  } catch (_) {
    return raw;
  }
}

function hashPassword(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createPasswordHash(password) {
  const saltHex = crypto.randomBytes(16).toString('hex');
  return {
    saltHex,
    hashHex: hashPassword(password, saltHex)
  };
}

function verifyPassword(password, account) {
  const candidateHex = hashPassword(password, account.passwordSalt);
  const candidateBuf = Buffer.from(candidateHex, 'hex');
  const storedBuf = Buffer.from(account.passwordHash, 'hex');
  if (candidateBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, storedBuf);
}

function issueWebToken(account, req, res) {
  const token = jwt.sign(
    {
      type: 'web',
      webAccountId: String(account._id),
      email: account.email,
      wallet: account.wallet || null
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('web_jwt', token, getCookieOptions(req));
  return token;
}

router.post('/register', async (req, res) => {
  try {
    const email = normalizeGmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email) {
      return res.status(400).json({ success: false, error: 'Only valid gmail.com addresses are allowed' });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ success: false, error: 'Password must be between 8 and 128 characters' });
    }

    const { saltHex, hashHex } = createPasswordHash(password);

    const account = await WebAccount.create({
      email,
      passwordHash: hashHex,
      passwordSalt: saltHex
    });

    issueWebToken(account, req, res);

    res.status(201).json({
      success: true,
      account: { email: account.email }
    });
  } catch (err) {
    if (err?.code === 11000) {
      if (err?.keyPattern?.email) {
        return res.status(409).json({ success: false, error: 'Email already registered' });
      }
      if (err?.keyPattern?.wallet) {
        return res.status(409).json({ success: false, error: 'Wallet already linked to another account' });
      }
      return res.status(409).json({ success: false, error: 'Duplicate account data' });
    }
    console.error('Web register error:', err);
    return res.status(500).json({ success: false, error: 'Failed to register account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = normalizeGmail(req.body?.email || req.body?.identifier);
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }
    const account = await WebAccount.findOne({ email });

    if (!account || !verifyPassword(password, account)) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const token = issueWebToken(account, req, res);

    return res.json({
      success: true,
      token,
      account: { email: account.email }
    });
  } catch (err) {
    console.error('Web login error:', err);
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
});

router.post('/link-wallet', async (req, res) => {
  try {
    const email = normalizeGmail(req.body?.email);
    const password = String(req.body?.password || '');
    const wallet = normalizeWallet(req.body?.wallet);

    if (!email || !password || !wallet) {
      return res.status(400).json({ success: false, error: 'Email, password, and wallet are required' });
    }

    const account = await WebAccount.findOne({ email });
    if (!account || !verifyPassword(password, account)) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    account.wallet = wallet;
    await account.save();

    issueWebToken(account, req, res);

    return res.json({
      success: true,
      account: { email: account.email, wallet: account.wallet }
    });
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.wallet) {
      return res.status(409).json({ success: false, error: 'Wallet already linked to another account' });
    }
    console.error('Link wallet error:', err);
    return res.status(500).json({ success: false, error: 'Failed to link wallet' });
  }
});

module.exports = router;
