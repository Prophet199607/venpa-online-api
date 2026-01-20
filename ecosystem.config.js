module.exports = {
  apps: [{
    name: 'venpa-online-api',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    // Restart delay
    restart_delay: 4000,
    // Maximum number of restarts within a minute before considering the app as unstable
    max_restarts: 10,
    min_uptime: '10s',
    // Listen timeout
    listen_timeout: 3000,
    // Kill timeout
    kill_timeout: 5000
  }]
};
