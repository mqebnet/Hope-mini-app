const express = require('express');
const router = express.Router();
const Referral = require('../models/Referral');
const User = require('../models/User');

router.get('/top-referrers', async (req, res) => {
  try {
    const topReferrers = await User.aggregate([
      {
        $project: {
          username: 1,
          invitedCount: { $ifNull: ['$invitedCount', 0] }
        }
      },
      {
        $lookup: {
          from: 'referrals',
          let: { ownerId: '$telegramId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$inviterId', '$$ownerId'] } } },
            { $count: 'count' }
          ],
          as: 'refRows'
        }
      },
      {
        $addFields: {
          referralScore: {
            $max: [
              '$invitedCount',
              { $ifNull: [{ $arrayElemAt: ['$refRows.count', 0] }, 0] }
            ]
          }
        }
      },
      { $sort: { referralScore: -1 } },
      { $limit: 50 },
      {
        $project: {
          _id: 0,
          userId: '$telegramId',
          username: 1,
          referrals: '$referralScore'
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
