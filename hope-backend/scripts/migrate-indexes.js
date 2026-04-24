require('dotenv').config();
const mongoose = require('mongoose');

// Import all models so their indexes are registered
require('../models/User');
require('../models/GameSession');
require('../models/ArcadeGameSession');
require('../models/Transaction');
require('../models/CheckIn');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected. Syncing indexes...');

  const models = ['User', 'GameSession', 'ArcadeGameSession',
                  'Transaction', 'CheckIn'];

  for (const name of models) {
    const model = mongoose.model(name);
    await model.syncIndexes();
    console.log(`✅ ${name} indexes synced`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
