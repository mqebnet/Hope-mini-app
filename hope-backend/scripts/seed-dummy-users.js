#!/usr/bin/env node

const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const User = require('../models/User');
const { getUserLevel } = require('../utils/levelUtil');
const ReferralSchema = new mongoose.Schema({
  inviterId: { type: Number, required: true },
  invitedId: { type: Number, required: true },
  joinedAt: { type: Date, default: Date.now }
}, { collection: 'referrals' });

ReferralSchema.index({ inviterId: 1, joinedAt: -1 });
ReferralSchema.index({ invitedId: 1 }, { unique: true });

const Referral = mongoose.models.Referral || mongoose.model('Referral', ReferralSchema);

const CLEAR = process.argv.includes('--clear');
const DRY_RUN = process.argv.includes('--dry-run');

const DUMMY_ID_MIN = 9_900_000_001;
const DUMMY_ID_MAX = 9_900_999_999;
const REFERRAL_LEADERBOARD_SIZE = 50;
const REFERRAL_COUNT_START = 6860;
const REFERRAL_LOWER_HUNDREDS_COUNT = 18;
const REFERRAL_MID_MIN = 350;
const REFERRAL_MID_MAX = 6500;
const REFERRAL_LOW_MIN = 100;
const REFERRAL_LOW_MAX = 299;

const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rnd(0, arr.length - 1)];

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rnd(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function genInviteCode(id) {
  return crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 8);
}

const LEVEL_RANGES = {
  Seeker: { min: 500, max: 49_500 },
  Dreamer: { min: 50_100, max: 99_000 },
  Believer: { min: 100_500, max: 490_000 },
  Challenger: { min: 500_500, max: 990_000 },
  Navigator: { min: 1_005_000, max: 1_990_000 },
  Ascender: { min: 2_010_000, max: 4_950_000 },
  Master: { min: 5_100_000, max: 9_800_000 },
  Grandmaster: { min: 10_100_000, max: 19_500_000 },
  Legend: { min: 20_500_000, max: 48_000_000 },
  Eldrin: { min: 55_000_000, max: 82_000_000 }
};

const LEVEL_XP_RANGES = {
  Seeker: { min: 25, max: 200 },
  Dreamer: { min: 201, max: 900 },
  Believer: { min: 901, max: 2_500 },
  Challenger: { min: 2_501, max: 5_000 },
  Navigator: { min: 5_001, max: 9_000 },
  Ascender: { min: 9_001, max: 14_000 },
  Master: { min: 14_001, max: 19_000 },
  Grandmaster: { min: 19_001, max: 24_000 },
  Legend: { min: 24_001, max: 28_000 },
  Eldrin: { min: 28_001, max: 30_000 }
};

const LEVEL_PLAN = [
  { level: 'Seeker', count: 100 },
  { level: 'Dreamer', count: 100 },
  { level: 'Believer', count: 100 },
  { level: 'Challenger', count: 50 },
  { level: 'Navigator', count: 50 },
  { level: 'Ascender', count: 50 },
  { level: 'Master', count: 20 },
  { level: 'Grandmaster', count: 10 },
  { level: 'Legend', count: 5 },
  { level: 'Eldrin', count: 1 }
];

const LEVEL_META = {
  Seeker: { bronzeMax: 50, silverMax: 2, goldMax: 0, inviteMax: 0, streakMax: 14 },
  Dreamer: { bronzeMax: 200, silverMax: 10, goldMax: 1, inviteMax: 3, streakMax: 30 },
  Believer: { bronzeMax: 500, silverMax: 30, goldMax: 3, inviteMax: 8, streakMax: 60 },
  Challenger: { bronzeMax: 1500, silverMax: 80, goldMax: 8, inviteMax: 15, streakMax: 90 },
  Navigator: { bronzeMax: 3000, silverMax: 150, goldMax: 15, inviteMax: 25, streakMax: 120 },
  Ascender: { bronzeMax: 6000, silverMax: 300, goldMax: 30, inviteMax: 40, streakMax: 180 },
  Master: { bronzeMax: 12000, silverMax: 600, goldMax: 60, inviteMax: 60, streakMax: 270 },
  Grandmaster: { bronzeMax: 25000, silverMax: 1200, goldMax: 120, inviteMax: 90, streakMax: 330 },
  Legend: { bronzeMax: 50000, silverMax: 2500, goldMax: 250, inviteMax: 130, streakMax: 360 },
  Eldrin: { bronzeMax: 99999, silverMax: 5000, goldMax: 500, inviteMax: 200, streakMax: 365 }
};

const ELDRIN_USERNAME = 'Eldrin';
const LEGEND_USERNAMES = [
  'Delu_the_Daring',
  'Akira_the_Assassin',
  'Mr_Beast',
  'علوان',
  'Akaza'
];
const MASTER_FIRST = 'Shifu';

const REGION_BASES = {
  arabic: [
    'Ali', 'Fatima', 'Hammad', 'Noura', 'Ziad', 'Reem', 'Khaled', 'Sarah',
    'Omar', 'Leen', 'Yusuf', 'Hind', 'Tariq', 'Dina', 'Rami', 'Salma',
    'Basma', 'Mariam', 'Saleh', 'Rana', 'Walid', 'Nadia', 'Layan', 'Majd'
  ],
  arabicScript: [
    'علي', 'فاطمة', 'حماد', 'نورة', 'زياد', 'ريم', 'خالد', 'سارة',
    'عمر', 'لين', 'يوسف', 'هند', 'طارق', 'دينا', 'رامي', 'سلمى'
  ],
  chinese: [
    'XiaoLong', 'MeiLing', 'TianMing', 'YunFei', 'FangFang', 'JianGuo',
    'XiuYing', 'ZhiQiang', 'LiHua', 'XiaoMing', 'LongFei', 'BaoBao',
    'MingLei', 'ChenFei', 'QingZhao', 'PhoenixZhang'
  ],
  chineseScript: [
    '小龙', '美玲', '天明', '云飞', '芳芳', '建国', '秀英', '志强',
    '丽华', '晓明', '静静', '浩然'
  ],
  russian: [
    'Sasha', 'Katya', 'Dmitri', 'Ivan', 'Olga', 'Nastya', 'Maxim', 'Natasha',
    'Boris', 'Alexei', 'Misha', 'Tanya', 'Vanya', 'Sonya', 'Kolya'
  ],
  russianScript: [
    'Александр', 'Екатерина', 'Дмитрий', 'Иван', 'Ольга', 'Анастасия',
    'Максим', 'Наталья', 'Борис', 'Алексей'
  ],
  spanish: [
    'Carlos', 'Isabella', 'MiguelAngel', 'Sofia', 'Diego', 'Valentina',
    'Pablo', 'Camila', 'Juan', 'Andres', 'LunaRosa', 'Mateo',
    'Gabriela', 'Sebastian', 'Daniela', 'Alejandro'
  ],
  filipino: [
    'Bayani', 'MariaLigaya', 'JuanTambay', 'Rizal', 'AtePinay', 'KuyaMark',
    'Lito', 'Jhona', 'Angel', 'Alyssa', 'TitoBoy', 'AteSandra',
    'KuyaKevin', 'CardoDalisay', 'Ligaya', 'Bonifacio'
  ],
  malaysian: [
    'AhmadRazif', 'SitiNur', 'Hafiz', 'NurulAin', 'ZulGaming', 'Farah',
    'Razif', 'Aisha', 'Haikal', 'Najwa', 'Aziz', 'Rina',
    'Syafiq', 'Husna', 'Izzat', 'Nabilah'
  ],
  indian: [
    'Rishnu', 'Priya', 'Arjun', 'Kavya', 'Sanjay', 'Deepa', 'Raj', 'Anjali',
    'Virat', 'Preethi', 'Arun', 'Swathi', 'Suresh', 'Manisha', 'Ravi', 'Pooja',
    'Vijay', 'Lakshmi', 'Kartik', 'Neha', 'Amit', 'Sunita', 'Rohan', 'Meena'
  ],
  nigerian: [
    'Ade', 'Chidi', 'Ngozi', 'Emeka', 'Funmi', 'Tunde', 'Kemi', 'Babs',
    'Folake', 'Seun', 'Amina', 'Zara', 'Chibuzo', 'Adaora', 'Ikechukwu', 'Oluwatobi',
    'Temi', 'Banky', 'Ifeoma', 'Olumide', 'Yetunde', 'Abiola', 'Chukwuma', 'Obi'
  ],
  english: [
    'JohnWick', 'Emma', 'Mike', 'Sarah', 'Dragon', 'Shadow', 'Thor', 'Luna',
    'Phoenix', 'Ninja', 'Omega', 'Alpha', 'Titan', 'Iron', 'Crystal', 'Aurora',
    'Noctis', 'Cloud', 'Terra', 'Tifa', 'Yuna', 'Auron', 'Naruto', 'Sasuke',
    'Luffy', 'Zoro', 'Nami', 'Robin', 'Solar', 'Lunar', 'Galaxy', 'Nebula'
  ],
  japanese: [
    'Hiro', 'Sakura', 'Yuki', 'Kenji', 'Haruto', 'Rin', 'Sora', 'Aoi', 'Kaito', 'Yui'
  ]
};

const HANDLE_SUFFIXES = [
  'X', 'Pro', 'Dark', 'Storm', 'Fire', 'G', 'Prime', 'Nova',
  'Pulse', 'Blaze', 'Rider', 'Ace', 'Vault', 'Core', 'Wave'
];
const LEVEL_ORDER = {
  Seeker: 1,
  Dreamer: 2,
  Believer: 3,
  Challenger: 4,
  Navigator: 5,
  Ascender: 6,
  Master: 7,
  Grandmaster: 8,
  Legend: 9,
  Eldrin: 10
};

function generateNamePool() {
  const pool = new Set();

  Object.values(REGION_BASES).forEach((names) => {
    names.forEach((name) => {
      pool.add(name);
      HANDLE_SUFFIXES.forEach((suffix) => pool.add(`${name}_${suffix}`));
    });
  });

  const themedExtras = [
    'Shadow_Emperor', 'Crimson_Knight', 'Ice_Phoenix', 'Thunder_God',
    'Void_Walker', 'Chrono_Master', 'Storm_Breaker', 'Infinity_X',
    'Cosmic_Force', 'Dark_Matter', 'Master_Blaster', 'Dragon_Lord',
    'Sage_Wisdom', 'Ancient_One', 'Warlord_X', 'Silent_Blade',
    'Ghost_Master', 'Tiger_Sage', 'Phantom_Lord', 'Serpent_King',
    'Iron_Master', 'Void_Sage', 'Storm_Lord', 'Frost_Master',
    'Blaze_Master', 'Shadow_Sage', 'Wind_Master', 'Lunar_Sage', 'Star_Master'
  ];

  themedExtras.forEach((name) => pool.add(name));
  return [...pool];
}

const NAME_POOL = generateNamePool();

function buildCompletedInviteTasks(invitedCount) {
  if (invitedCount >= 10) return [1, 3, 5, 10];
  if (invitedCount >= 5) return [1, 3, 5];
  if (invitedCount >= 3) return [1, 3];
  if (invitedCount >= 1) return [1];
  return [];
}

function buildReferralCountTargets() {
  const midCountTotal = REFERRAL_LEADERBOARD_SIZE - 1 - REFERRAL_LOWER_HUNDREDS_COUNT;
  const reserved = new Set([REFERRAL_COUNT_START]);
  const midCounts = new Set();
  const lowCounts = new Set();

  while (midCounts.size < midCountTotal) {
    const value = rnd(REFERRAL_MID_MIN, REFERRAL_MID_MAX);
    if (!reserved.has(value)) {
      midCounts.add(value);
      reserved.add(value);
    }
  }

  while (lowCounts.size < REFERRAL_LOWER_HUNDREDS_COUNT) {
    const value = rnd(REFERRAL_LOW_MIN, REFERRAL_LOW_MAX);
    if (!reserved.has(value)) {
      lowCounts.add(value);
      reserved.add(value);
    }
  }

  return [
    REFERRAL_COUNT_START,
    ...[...midCounts].sort((a, b) => b - a),
    ...[...lowCounts].sort((a, b) => b - a)
  ];
}

function buildUsers() {
  const shuffledPool = shuffle(NAME_POOL);
  const users = [];
  let poolIdx = 0;
  let telegramId = DUMMY_ID_MIN;
  let masterFirstDone = false;
  let legendIdx = 0;

  for (const { level, count } of LEVEL_PLAN) {
    const range = LEVEL_RANGES[level];
    const xpRange = LEVEL_XP_RANGES[level];
    const meta = LEVEL_META[level];

    for (let i = 0; i < count; i++) {
      let username;

      if (level === 'Eldrin') {
        username = ELDRIN_USERNAME;
      } else if (level === 'Legend') {
        username = LEGEND_USERNAMES[legendIdx++];
      } else if (level === 'Master' && !masterFirstDone) {
        username = MASTER_FIRST;
        masterFirstDone = true;
      } else {
        username = shuffledPool[poolIdx++] || `Player_${telegramId}`;
      }

      const points = rnd(range.min, range.max);
      const derivedLevel = getUserLevel(points);
      if (derivedLevel !== level) {
        throw new Error(`Generated points mismatch for ${username}: expected ${level}, got ${derivedLevel}`);
      }

      const streak = rnd(0, meta.streakMax);
      const bronzeTickets = rnd(0, meta.bronzeMax);
      const silverTickets = rnd(0, meta.silverMax);
      const goldTickets = rnd(0, meta.goldMax);
      const invitedCount = rnd(0, meta.inviteMax);
      const isMining = Math.random() > 0.5;
      const miningStartedAt = isMining
        ? new Date(Date.now() - rnd(0, 6 * 3600_000))
        : null;
      const lastCheckInDate = Math.random() > 0.3
        ? new Date(Date.now() - rnd(0, 14) * 86_400_000)
        : null;

      users.push({
        telegramId,
        username,
        isAdmin: false,
        points,
        xp: rnd(xpRange.min, xpRange.max),
        level,
        streak,
        inviteCode: genInviteCode(telegramId),
        invitedBy: null,
        invitedCount,
        inviteClaims: {
          one: invitedCount >= 1,
          three: invitedCount >= 3,
          five: invitedCount >= 5,
          ten: invitedCount >= 10
        },
        completedInviteTasks: buildCompletedInviteTasks(invitedCount),
        bronzeTickets,
        silverTickets,
        goldTickets,
        miningStartedAt,
        lastMiningClaim: miningStartedAt
          ? new Date(miningStartedAt.getTime() - rnd(6, 72) * 3600_000)
          : null,
        lastCheckInDate
      });

      telegramId += 1;
    }
  }

  const masterPlusIds = users
    .filter((user) => ['Master', 'Grandmaster', 'Legend', 'Eldrin'].includes(user.level))
    .map((user) => user.telegramId);

  for (const user of users) {
    if (['Seeker', 'Dreamer', 'Believer', 'Challenger'].includes(user.level) && Math.random() < 0.4) {
      user.invitedBy = pick(masterPlusIds);
    }
  }

  return users;
}

function buildReferralLeaderboardSeed(users) {
  const rankedUsers = [...users].sort((a, b) => {
    const levelDiff = (LEVEL_ORDER[b.level] || 0) - (LEVEL_ORDER[a.level] || 0);
    if (levelDiff !== 0) return levelDiff;
    if (b.points !== a.points) return b.points - a.points;
    return a.telegramId - b.telegramId;
  });

  const inviters = rankedUsers.slice(0, REFERRAL_LEADERBOARD_SIZE);
  if (inviters.length < REFERRAL_LEADERBOARD_SIZE) {
    throw new Error(`Expected at least ${REFERRAL_LEADERBOARD_SIZE} users for referral seeding`);
  }

  const referralCounts = buildReferralCountTargets();
  const inviterTargets = new Map();
  inviters.forEach((user, index) => {
    inviterTargets.set(user.telegramId, referralCounts[index]);
  });

  const inviteePool = users.filter((user) => !inviterTargets.has(user.telegramId));
  for (const user of users) {
    const targetCount = inviterTargets.get(user.telegramId) || 0;
    user.invitedCount = targetCount;
    user.inviteClaims = {
      one: targetCount >= 1,
      three: targetCount >= 3,
      five: targetCount >= 5,
      ten: targetCount >= 10
    };
    user.completedInviteTasks = buildCompletedInviteTasks(targetCount);
    user.invitedBy = null;
  }

  const referralDocs = [];
  let nextInvitedId = DUMMY_ID_MIN + users.length;

  for (const inviter of inviters) {
    let remaining = inviterTargets.get(inviter.telegramId);

    while (remaining > 0 && inviteePool.length > 0) {
      const invitee = inviteePool.shift();
      invitee.invitedBy = inviter.telegramId;
      referralDocs.push({
        inviterId: inviter.telegramId,
        invitedId: invitee.telegramId,
        joinedAt: new Date(Date.now() - rnd(0, 60) * 86_400_000)
      });
      remaining -= 1;
    }

    while (remaining > 0) {
      referralDocs.push({
        inviterId: inviter.telegramId,
        invitedId: nextInvitedId,
        joinedAt: new Date(Date.now() - rnd(0, 60) * 86_400_000)
      });
      nextInvitedId += 1;
      remaining -= 1;
    }
  }

  return {
    inviters,
    referralDocs,
    highestDummyId: nextInvitedId - 1
  };
}

function printPlan(users) {
  const summary = {};
  for (const user of users) {
    summary[user.level] = (summary[user.level] || 0) + 1;
  }

  console.log('\nSeed plan:');
  for (const { level } of LEVEL_PLAN) {
    console.log(`  ${level.padEnd(12)} ${String(summary[level] || 0).padStart(3)} users`);
  }
  console.log(`  ${'TOTAL'.padEnd(12)} ${String(users.length).padStart(3)} users`);
  console.log(`\n  TelegramId range: ${DUMMY_ID_MIN} - ${users[users.length - 1].telegramId}\n`);
}

function printDryRunSamples(users) {
  console.log('Dry run only. No database changes were made.\n');

  for (const { level, count } of LEVEL_PLAN) {
    const sample = users
      .filter((user) => user.level === level)
      .slice(0, 3)
      .map((user) => user.username)
      .join(', ');

    const suffix = count > 3 ? ` ... (+${count - 3} more)` : '';
    console.log(`  ${level.padEnd(12)} ${sample}${suffix}`);
  }

  console.log('');
}

function printReferralPreview(inviters) {
  console.log('Referral leaderboard preview:\n');

  inviters.slice(0, 10).forEach((user, index) => {
    console.log(`  ${String(index + 1).padStart(2)}. ${String(user.username).padEnd(24)} ${user.invitedCount}`);
  });

  if (inviters.length > 10) {
    console.log(`  ... ${inviters.length - 10} more seeded referrers`);
  }

  console.log('');
}

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in hope-backend/.env');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000
  });
}

async function insertUsers(users) {
  let inserted = 0;
  let skipped = 0;

  try {
    const result = await User.insertMany(users, { ordered: false });
    inserted = result.length;
  } catch (err) {
    if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
      inserted = err.result?.nInserted ?? (users.length - (err.writeErrors?.length ?? 0));
      skipped = err.writeErrors?.length ?? 0;
    } else {
      throw err;
    }
  }

  return { inserted, skipped };
}

async function insertReferrals(referralDocs) {
  if (!referralDocs.length) return { inserted: 0, skipped: 0 };

  let inserted = 0;
  let skipped = 0;

  const batchSize = 5000;
  for (let i = 0; i < referralDocs.length; i += batchSize) {
    const batch = referralDocs.slice(i, i + batchSize);

    try {
      const result = await Referral.insertMany(batch, { ordered: false });
      inserted += result.length;
    } catch (err) {
      if (err.code === 11000 || err.name === 'MongoBulkWriteError') {
        inserted += err.result?.nInserted ?? 0;
        skipped += err.writeErrors?.length ?? 0;
      } else {
        throw err;
      }
    }
  }

  return { inserted, skipped };
}

async function main() {
  const users = buildUsers();
  const { inviters, referralDocs, highestDummyId } = buildReferralLeaderboardSeed(users);
  printPlan(users);
  printReferralPreview(inviters);

  if (DRY_RUN) {
    printDryRunSamples(users);
    return;
  }

  await connectDB();
  console.log('Connected to MongoDB');

  if (CLEAR) {
    const result = await User.deleteMany({
      telegramId: { $gte: DUMMY_ID_MIN, $lte: DUMMY_ID_MAX }
    });
    await Referral.deleteMany({
      $or: [
        { invitedId: { $gte: DUMMY_ID_MIN, $lte: DUMMY_ID_MAX } },
        { inviterId: { $gte: DUMMY_ID_MIN, $lte: DUMMY_ID_MAX } }
      ]
    });
    console.log(`Cleared ${result.deletedCount} dummy users and their referral records`);
  }

  const { inserted, skipped } = await insertUsers(users);

  console.log(`Inserted ${inserted} users`);
  if (skipped > 0) {
    console.log(`Skipped ${skipped} duplicates`);
  }

  const { inserted: referralInserted, skipped: referralSkipped } = await insertReferrals(referralDocs);
  if (referralInserted > 0) {
    console.log(`Referral docs inserted: ${referralInserted}`);
  }
  if (referralSkipped > 0) {
    console.log(`Referral duplicates skipped: ${referralSkipped}`);
  }
  console.log(`Highest dummy referral id used: ${highestDummyId}`);
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
