/**
 * Determine user's level based on accumulated points
 * @param {number} points - User's total accumulated points
 * @returns {string} Level name (Seeker → Eldrin)
 * @example
 * getUserLevel(75000) // 'Dreamer'
 * getUserLevel(0)     // 'Seeker'
 * getUserLevel(1e9)   // 'Eldrin'
 */
function getUserLevel(points) {
  if (points < 50000) return "Seeker";               // 0 to 50,000
  else if (points < 100000) return "Dreamer";         // 50,000 to 100,000
  else if (points < 500000) return "Believer";         // 100,000 to 500,000
  else if (points < 1000000) return "Challenger";       // 500,000 to 1,000,000
  else if (points < 2000000) return "Navigator";        // 1,000,000 to 2,000,000
  else if (points < 5000000) return "Ascender";         // 2,000,000 to 5,000,000
  else if (points < 10000000) return "Master";          // 5,000,000 to 10,000,000
  else if (points < 20000000) return "Grandmaster";     // 10,000,000 to 20,000,000
  else if (points < 50000000) return "Legend";          // 20,000,000 to 50,000,000
  else if (points < 100000000) return "Eldrin";         // 50,000,000 to 100,000,000
  else return "Eldrin"; // For points above 100,000,000
}

/**
 * Get the point threshold required for the next level
 * @param {number} points - User's current points
 * @returns {number} Points needed to reach next level (or max if already at Eldrin)
 * @example
 * getNextLevelThreshold(25000)  // 50000
 * getNextLevelThreshold(75000)  // 100000
 */
function getNextLevelThreshold(points) {
  const thresholds = [
    50000,      // Seeker -> Dreamer
    100000,     // Dreamer -> Believer
    500000,     // Believer -> Challenger
    1000000,    // Challenger -> Navigator
    2000000,    // Navigator -> Ascender
    5000000,    // Ascender -> Master
    10000000,   // Master -> Grandmaster
    20000000,   // Grandmaster -> Legend
    50000000,   // Legend -> Eldrin
    100000000   // Eldrin max
  ];

  for (const threshold of thresholds) {
    if (points < threshold) return threshold;
  }
  return 100000000; // Max threshold
}

module.exports = { getUserLevel, getNextLevelThreshold };
