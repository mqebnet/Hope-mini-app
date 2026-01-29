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

module.exports = { getUserLevel };
