/**
 * PM2 — mantém o servidor Node rodando 24/7 na VM Oracle Cloud.
 *
 * Uso na VM:
 *   cd /opt/newsletter
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 *   pm2 startup   # seguir instruções exibidas
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
        SENDER_API_KEY: "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiZjZjZGM2MWMxNmJiMzc4YmI5ZTU5NjUwNDczZWFhNGNhYWJlNDVmYmIyOTg3YjllMmJlOTJlZTMzMGI1MjMxYzRlN2Y2NjUyNTNmMjQ2ODMiLCJpYXQiOjE3ODI0MTYxNjYuODc0OTcxLCJuYmYiOjE3ODI0MTYxNjYuODc0OTc0LCJleHAiOjQ5MzYwMTYxNjYuODcyMDE1LCJzdWIiOiIxMDgxNzM4Iiwic2NvcGVzIjpbXX0.TBx5IMgJMm3ky08QFzfvAdiUjC61Rczge3_guvsPqC5QvAAgkfQadv5Kh7N1SsGEgMxzca-3q_ayXWVVpKdVDUKj1aowz_F8xmjKbM7FE53XQc7FAWiCoVvhUbwOMt2p2XVCgZD59TbKV-KHVvsHLRaIwfv4VFSOBqOXRFF4Npadwwfga7eRWnUoXhZAg0Oo114B9auEsStfLTxdsS4TT_yRTBjuGVkKgNtoUkYIW32BYonXtoSh54kOCbLJpnxYRTf1za1UbtOoKlyUw3d7Ry5a1udiV7mh4cao2TRqxKQjWcLrGIXNUdnbKexiqrDVuaKlXZl3IRapWkeCT5Y2p3glOmQ0Sk3dyj40sJYKl5jATtu-3otIYK8I_1SzRzEAiADQ2OFd3NDlX2SdJ6fb5v79hLXQwmQFsIrhgv6j8UyYpyNFFileGMPvzCLW7rE5zvHRsOuFx_bD_-Vr7e0w80vFw7gJaujjaVYnDHdqASQ7b81t33uT98MW0rFml0X51kW_pK3hJIicQG_FAFnltQZO7Jbeh37t8m5nL1jWZU7Efh00YTlErDPa_akWINX_ZdToukGe37uTm2MJPAtjKNvQgB7WGuOjhc0FEpUQqLfIAZOcbtfS0H9Gp2FR4kOS7GHQZxqM2b16_cMH5_d0GsU6RmYf78XblTRNd7K_HOk",
        FROM_EMAIL: "newsletter@techndevn.com"
      },
      error_file: "/var/log/newsletter/error.log",
      out_file: "/var/log/newsletter/out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
