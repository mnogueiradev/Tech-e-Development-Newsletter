/**
 * PM2 — mantém o servidor Node rodando 24/7 na VM Oracle Cloud.
 *
 * Uso na VM:
 *   cd /home/ubuntu/Tech-e-Development-Newsletter
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 */
module.exports = {
  apps: [
    {
      name: "newsletter",
      script: "server.js",
      cwd: __dirname + "/..",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        FROM_EMAIL: "newsletter@techndevn.com",
      },
      error_file: "/var/log/newsletter/error.log",
      out_file: "/var/log/newsletter/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
