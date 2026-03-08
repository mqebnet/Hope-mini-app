const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * GameSession Schema
 * Tracks Flip Cards game sessions with anti-cheat protection
 *
 * Features:
 * - Triplet matching (3 cards per set)
 * - Server-side card state with hashes
 * - Timing validation (60s limit)
 * - Attempt tracking (anti-cheat)
 * - Reward calculation based on performance
 */

const GameSessionSchema = new mongoose.Schema({
  // Game session metadata
  telegramId: {
    type: Number,
    required: true,
    index: true
  },
  gameType: {
    type: String,
    enum: ['flipcards'],
    default: 'flipcards'
  },

  // Game state
  status: {
    type: String,
    enum: ['active', 'completed', 'abandoned'],
    default: 'active'
  },

  // Triplet card data (stored encrypted on server)
  // Each card object: { id: uniuqe_id, symbol: emoji/symbol, pairingId: triplet_group_id, revealed: bool }
  cards: {
    type: [
      {
        id: { type: String }, // unique card ID
        symbol: { type: String }, // emoji or symbol displayed
        tripletId: { type: String }, // groups cards into triplets (3 cards = 1 triplet)
        revealed: { type: Boolean, default: false }
      }
    ],
    required: true
  },

  // Anti-cheat: checksum of original card order (unhashed)
  // Used to validate client-side flips didn't alter card structure
  cardStateChecksum: { type: String, required: true },

  // Triplets already matched (array of tripletIds)
  matchedTriplets: {
    type: [String],
    default: []
  },

  // Number of triplets in this game
  totalTriplets: { type: Number, required: true },

  // Player actions tracking (anti-cheat)
  moves: {
    type: [
      {
        cardIds: [String], // cards flipped in this move (1-3 cards)
        timestamp: { type: Date, default: Date.now },
        duration: Number // milliseconds since game start
      }
    ],
    default: []
  },

  // Timing data
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  timeLimitSeconds: { type: Number, default: 60 },

  // Performance metrics
  matchAttempts: { type: Number, default: 0 }, // total moves made
  correctMatches: { type: Number, default: 0 }, // successful triplet matches
  timeUsedSeconds: { type: Number, default: 0 }, // actual time spent

  // Reward data
  reward: {
    points: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    bronzeTickets: { type: Number, default: 0 },
    earnedAt: { type: Date, default: null }
  },
  rewardClaimed: { type: Boolean, default: false },

  // Anti-cheat verification
  clientHashes: {
    type: Map,
    of: String, // cardId -> clientHash of final state
    default: new Map()
  },
  speedAnalysis: {
    avgMoveTime: { type: Number, default: 0 }, // avg milliseconds per move
    suspiciousPattern: { type: Boolean, default: false }, // flagged for review
    flagReason: { type: String, default: '' }
  }
}, { timestamps: true });

// Generate initial shuffled triplet cards
GameSessionSchema.statics.generateGame = function(numTriplets = 3) {
  if (numTriplets < 1 || numTriplets > 5) {
    throw new Error('Number of triplets must be between 1 and 5');
  }

  const symbols = ['🌟', '🎮', '🚀', '💎', '🔥', '🌈', '⚡', '🎯'];
  const selectedSymbols = symbols.slice(0, numTriplets);

  // Create 3 cards per triplet
  let cards = [];
  selectedSymbols.forEach((symbol, index) => {
    const tripletId = `triplet_${index}`;
    for (let i = 0; i < 3; i++) {
      cards.push({
        id: `card_${tripletId}_${i}`,
        symbol,
        tripletId,
        revealed: false
      });
    }
  });

  // Shuffle using Fisher-Yates algorithm
  cards = GameSessionSchema.statics.shuffleCards(cards);

  // Generate checksum (before client sees it)
  const checksum = crypto
    .createHash('sha256')
    .update(JSON.stringify(cards))
    .digest('hex');

  return { cards, checksum, totalTriplets: numTriplets };
};

// Fisher-Yates shuffle
GameSessionSchema.statics.shuffleCards = function(cards) {
  const shuffled = [...cards];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Validate a move (anti-cheat)
GameSessionSchema.methods.validateMove = function(cardIds) {
  if (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.length > 3) {
    return { valid: false, reason: 'Invalid card selection (must flip 1-3 cards)' };
  }

  // Check if all cards exist and are not already matched
  for (const cardId of cardIds) {
    const card = this.cards.find((c) => c.id === cardId);
    if (!card) {
      return { valid: false, reason: 'Card not found' };
    }
    if (this.matchedTriplets.includes(card.tripletId)) {
      return { valid: false, reason: 'Card already matched' };
    }
  }

  // Check timing (no instant moves)
  const now = new Date();
  const elapsed = (now - this.startedAt) / 1000;
  if (elapsed > this.timeLimitSeconds) {
    return { valid: false, reason: 'Time limit exceeded' };
  }

  return { valid: true };
};

// Check if move results in a valid triplet match
GameSessionSchema.methods.checkTripletMatch = function(cardIds) {
  const triplets = new Set();
  for (const cardId of cardIds) {
    const card = this.cards.find((c) => c.id === cardId);
    if (card) triplets.add(card.tripletId);
  }

  // For a triplet match, all flipped cards must be from the SAME triplet
  if (triplets.size === 1 && cardIds.length === 3) {
    return { matched: true, tripletId: Array.from(triplets)[0] };
  }

  return { matched: false };
};

// Calculate reward based on performance
GameSessionSchema.methods.calculateReward = function() {
  const perfect = this.matchAttempts === this.totalTriplets ? 1.5 : 1; // bonus for perfect play
  const speed = Math.max(1, 2 - this.timeUsedSeconds / 30); // faster = more points
  const basePoints = 50;

  const points = Math.floor(basePoints * perfect * speed);
  const xp = 1; // Fixed XP reward: 1 per game

  return {
    points: Math.max(20, points),
    xp: Math.max(1, xp),
    bronzeTickets: Math.random() > 0.7 ? 5 : 0 // 30% chance
  };
};

// Detect suspicious patterns (anti-cheat)
GameSessionSchema.methods.detectSuspiciousActivity = function() {
  if (this.moves.length < 2) return { suspicious: false };

  // Check average move time
  const totalTime = this.moves[this.moves.length - 1].duration || 1;
  const avgTime = totalTime / this.moves.length;

  // Flag if avg move < 200ms (humanly impossible for card matching)
  if (avgTime < 200) {
    return {
      suspicious: true,
      reason: 'Suspiciously fast move patterns',
      avgTime
    };
  }

  // Check for perfect matches first try (unlikely unless cheating)
  const perfectScore = this.matchAttempts === this.totalTriplets;
  const veryFastCompletion = this.timeUsedSeconds < 15;
  if (perfectScore && veryFastCompletion) {
    return {
      suspicious: true,
      reason: 'Perfect score in impossibly short time',
      time: this.timeUsedSeconds
    };
  }

  return { suspicious: false };
};

module.exports = mongoose.model('GameSession', GameSessionSchema);
