module.exports = {
  apps: [{
    name: 'baileys-test',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork', // fork ao invés de cluster (mais simples para teste)

    // === OTIMIZAÇÕES DE MEMÓRIA (Baileys usa MUITO menos!) ===
    node_args: [
      '--expose-gc',
      '--max-old-space-size=512' // Baileys precisa apenas 512MB!
    ],

    // === AUTO-RESTART INTELIGENTE ===
    max_memory_restart: '400M',    // Baileys raramente passa de 300MB
    max_restarts: 10,
    min_uptime: '10s',

    // === LOGS ===
    error_file: '/root/.pm2/logs/baileys-test-error.log',
    out_file: '/root/.pm2/logs/baileys-test-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // === ENVIRONMENT VARIABLES ===
    env: {
      NODE_ENV: 'production',
      BOT_INSTANCE: 'baileys-test',
      SHARED_DATA_DIR: '/root/dados_compartilhados'
    },

    // === SEM RESTART AUTOMÁTICO DIÁRIO (apenas para teste) ===
    // cron_restart: '0 4 * * *', // Desabilitado

    // === WATCH (desabilitado) ===
    watch: false,
    ignore_watch: ['node_modules', 'logs', '*.log', 'backup_historico', 'auth_baileys'],

    // === AUTORESTART ===
    autorestart: true,

    // === KILL TIMEOUT ===
    kill_timeout: 5000
  }]
};
