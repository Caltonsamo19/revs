// ============================================================================
// CONEXÃO MARIADB
// Pool de conexões para melhor performance
// ============================================================================

const mysql = require('mysql2/promise');

// Criar pool de conexões
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'bot_api',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bot_retalho',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// Testar conexão ao iniciar
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Conectado ao MariaDB');
        connection.release();
    } catch (error) {
        console.error('❌ Erro ao conectar ao MariaDB:', error.message);
        console.error('Verifique as configurações no arquivo .env');
    }
})();

// Helper para queries
const query = async (sql, params) => {
    const [results] = await pool.execute(sql, params);
    return results;
};

module.exports = {
    pool,
    query
};
