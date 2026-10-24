module.exports = {
  apps: [
    {
      name: 'flowly-backend',
      script: 'server.js',
      instances: 1, // Single instance required for in-memory WebRTC rooms & node-cron jobs
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
