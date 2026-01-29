const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/top-referrers', async (req, res) => {
  try {
    const topReferrers = await User.aggregate([
      {
        $project: {
          username: 1,
          invitedCount: 1,
          referrals: 1,
          referralScore: {
            $size: "$referrals"
          }
        }
      },
      { $sort: { referralScore: -1 } },
      { $limit: 50 },
      {
        $project: {
          _id: 0,
          userId: 1,
          username: 1,
          referrals: { $size: "$referrals" },
        }
      }
    ]);

    res.json(topReferrers);
  } catch (error) {
    console.error('Leaderboard Error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;