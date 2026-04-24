const mongoose = require('mongoose');

const WebAccountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: { type: String, required: true },
  passwordSalt: { type: String, required: true },
  wallet: {
    type: String,
    default: null,
    unique: true,
    sparse: true,
    trim: true
  }
}, { timestamps: true });

module.exports = mongoose.models.WebAccount || mongoose.model('WebAccount', WebAccountSchema);
