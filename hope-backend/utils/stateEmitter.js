// Central event emitter for broadcasting user state changes via WebSocket
// Emits when: mining completes, points/xp awarded, daily check-in done, leaderboard changes
// Instead of polling, connected clients receive live updates

const EventEmitter = require('events');

class StateEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  // User balance changed: points, XP, tickets
  emitUserBalanceUpdate(telegramId, userData) {
    this.emit(`user:${telegramId}:balance`, {
      points: userData.points,
      xp: userData.xp,
      level: userData.level,
      nextLevelAt: userData.nextLevelAt,
      bronzeTickets: userData.bronzeTickets,
      silverTickets: userData.silverTickets,
      goldTickets: userData.goldTickets,
      streak: userData.streak,
      miningStartedAt: userData.miningStartedAt,
      lastCheckInAt: userData.lastCheckInAt,
      transactionsCount: userData.transactionsCount
    });
  }

  // Full user data update (used after game completion, task claim, etc.)
  // This triggers leaderboard updates for affected level
  emitUserDataUpdate(telegramId, userData) {
    this.emit(`user:${telegramId}:full`, {
      points: userData.points,
      xp: userData.xp,
      level: userData.level,
      nextLevelAt: userData.nextLevelAt,
      bronzeTickets: userData.bronzeTickets,
      silverTickets: userData.silverTickets,
      goldTickets: userData.goldTickets,
      streak: userData.streak,
      miningStartedAt: userData.miningStartedAt,
      lastCheckInAt: userData.lastCheckInAt,
      transactionsCount: userData.transactionsCount,
      username: userData.username,
      telegramId: userData.telegramId
    });

    // Invalidate leaderboard for this user's level since their points changed
    this.invalidateLeaderboard(userData.level);
  }

  // Invalidate leaderboard cache (notifies clients to refresh)
  invalidateLeaderboard(levelName) {
    // Map level name to index for broadcast
    const LEVEL_INDEX = {
      Seeker: 1, Dreamer: 2, Believer: 3, Challenger: 4, Navigator: 5,
      Ascender: 6, Master: 7, Grandmaster: 8, Legend: 9, Eldrin: 10
    };
    
    const levelIndex = LEVEL_INDEX[levelName];
    if (levelIndex) {
      this.emit('leaderboard:updated', {
        levelIndex,
        timestamp: Date.now()
      });
    }
  }

  // Mining started or completed
  emitMiningUpdate(telegramId, miningStartedAt, isComplete = false) {
    this.emit(`user:${telegramId}:mining`, {
      miningStartedAt,
      isComplete
    });
  }

  // Leaderboard changed (someone's points updated)
  emitLeaderboardUpdate(levelIndex) {
    this.emit(`leaderboard:${levelIndex}:updated`, {
      timestamp: Date.now()
    });
  }

  // Global notification (contest starts, event trigger)
  emitGlobalEvent(eventType, data) {
    this.emit('global:event', {
      type: eventType,
      data,
      timestamp: Date.now()
    });
  }

  // Daily reset happened
  emitDailyReset() {
    this.emit('global:daily-reset', {
      timestamp: Date.now()
    });
  }

  // Contest updated
  emitContestUpdate(week) {
    this.emit(`contest:${week}:updated`, {
      timestamp: Date.now()
    });
  }
}

module.exports = new StateEmitter();
