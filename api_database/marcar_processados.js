// ============================================================================
// SCRIPT: Marcar todos pedidos como PROCESSADOS
// Atualiza status de todas as tabelas (pedidos_comuns, pedidos_diamante, pagamentos)
// ============================================================================

// Configuração manual do banco de dados
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'bot_api',
    password: '',
    database: 'bot_retalho',
    waitForConnections: true,
    connectionLimit: 10
});

async function marcarTodosProcessados() {
    try {
        console.log('🔄 Iniciando marcação de pedidos comuns como processados...\n');

        // Marcar APENAS pedidos comuns
        const [resultComuns] = await pool.execute(
            'UPDATE pedidos_comuns SET status = ? WHERE status = ?',
            ['PROCESSADO', 'PENDENTE']
        );
        console.log(`✅ Pedidos Comuns: ${resultComuns.affectedRows} registros marcados como PROCESSADO`);

        // Resumo
        console.log(`\n📊 TOTAL: ${resultComuns.affectedRows} registros atualizados com sucesso!\n`);

        // Mostrar estatísticas
        await mostrarEstatisticas();

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro ao marcar pedidos:', error.message);
        process.exit(1);
    }
}

async function mostrarEstatisticas() {
    try {
        // Contar pedidos comuns
        const [comuns] = await pool.execute(
            'SELECT status, COUNT(*) as total FROM pedidos_comuns GROUP BY status'
        );
        console.log('📋 Pedidos Comuns:');
        comuns.forEach(row => console.log(`   ${row.status}: ${row.total}`));

    } catch (error) {
        console.error('❌ Erro ao buscar estatísticas:', error.message);
    }
}

// Executar
marcarTodosProcessados();
