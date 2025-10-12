module.exports = {
  apps: [
    // === AGENDADOR DE REINICIALIZAÇÃO ===
    // Este processo agenda a reinicialização diária às 18h
    {
      name: 'scheduler-restart',
      script: 'schedule-restart.js',
      cwd: '/root/bot-revendedores1',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '100M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/root/bot-revendedores1/logs/scheduler-error.log',
      out_file: '/root/bot-revendedores1/logs/scheduler-out.log',
      time: true
    }
  ]
};

// NOTA: Os bots individuais devem estar configurados em seus
// respectivos diretórios com PM2. Este arquivo gerencia apenas
// o agendador central de reinicialização.
