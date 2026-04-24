module.exports = {
  apps: [{
    name: 'hope-app',
    script: 'app.js',
    instances: process.env.CLUSTER_WORKERS || 'max',
    exec_mode: 'cluster',
    env: { NODE_ENV: 'development', PORT: 3000 },
    env_production: { NODE_ENV: 'production', PORT: 3000 }
  }]
};
