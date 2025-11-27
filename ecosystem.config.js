module.exports = {
  apps: [{
    name: 'revs',
    script: './index.js',
    instances: 1,
    exec_mode: 'cluster',

    // === OTIMIZAÇÕES DE MEMÓRIA ===
    node_args: [
      '--expose-gc',              // Habilitar Garbage Collection manual
      '--max-old-space-size=2048' // Limite de 2GB de RAM
    ],

    // === AUTO-RESTART INTELIGENTE ===
    max_memory_restart: '1800M',  // Reiniciar se usar > 1.8GB
    max_restarts: 10,              // Máximo 10 restarts em 1 minuto
    min_uptime: '10s',             // Considerar "online" após 10s

    // === LOGS ===
    error_file: '/root/.pm2/logs/revs-error.log',
    out_file: '/root/.pm2/logs/revs-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // === ENVIRONMENT ===
    env: {
      NODE_ENV: 'production'
    },

    // === RESTART AUTOMÁTICO DIÁRIO ===
    cron_restart: '0 4 * * *',    // Reiniciar às 4h da manhã (horário de menos uso)

    // === WATCH (desabilitado em produção) ===
    watch: false,
    ignore_watch: ['node_modules', 'logs', '*.log', 'backup_historico'],

    // === AUTORESTART ===
    autorestart: true,

    // === KILL TIMEOUT ===
    kill_timeout: 5000             // Aguardar 5s antes de matar processo
  }]
};
