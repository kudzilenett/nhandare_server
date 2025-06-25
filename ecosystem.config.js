module.exports = {
  apps: [
    {
      name: "nhandare-backend",
      script: "dist/index.js",
      instances: "max", // Use all available CPU cores
      exec_mode: "cluster",

      // Environment configuration
      env: {
        NODE_ENV: "development",
        PORT: 3001,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3001,
      },

      // Performance settings
      max_memory_restart: "1G",
      min_uptime: "10s",
      max_restarts: 10,

      // Auto restart settings
      autorestart: true,
      watch: false, // Set to true in development if needed
      ignore_watch: ["node_modules", "logs", ".git"],

      // Logging
      log_file: "./logs/pm2.log",
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,

      // Advanced settings
      kill_timeout: 5000,
      listen_timeout: 3000,

      // Source mapping for better error traces
      source_map_support: true,

      // Health monitoring
      health_check_url: "http://localhost:3001/health",
      health_check_grace_period: 3000,
    },
  ],

  // Deployment configuration (optional)
  deploy: {
    production: {
      user: "deploy",
      host: ["your-server-ip"],
      ref: "origin/main",
      repo: "git@github.com:your-username/nhandare-backend.git",
      path: "/var/www/nhandare-backend",
      "post-deploy":
        "npm install && npm run build && pm2 reload ecosystem.config.js --env production",
      "pre-setup": "apt update && apt install git -y",
      ssh_options: "StrictHostKeyChecking=no",
    },
  },
};
