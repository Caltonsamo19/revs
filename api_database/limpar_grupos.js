// ============================================================================
// SCRIPT PARA LIMPAR DADOS DE GRUPOS ESPECÍFICOS
// ============================================================================

require('dotenv').config();
const { pool, query } = require('./database');

const GRUPOS_LIMPAR = [
    '120363402609218031@g.us',
    '120363131493688789@g.us',
    '120363024858104299@g.us'
];

async function limparDadosGrupos() {
    console.log('🗑️  Iniciando limpeza de dados dos grupos...\n');

    try {
        // 1. Eliminar pacotes (tabela principal)
        console.log('📦 Eliminando pacotes...');
        for (const grupo of GRUPOS_LIMPAR) {
            const resultPacotes = await query(
                'DELETE FROM pacotes WHERE grupo_id = ?',
                [grupo]
            );
            console.log(`   ✅ Grupo ${grupo}: ${resultPacotes.affectedRows} pacote(s) eliminado(s)`);
        }

        // 2. Eliminar pacotes_clientes relacionados
        console.log('\n📋 Eliminando pacotes_clientes...');
        for (const grupo of GRUPOS_LIMPAR) {
            const resultClientes = await query(
                'DELETE FROM pacotes_clientes WHERE grupo_id = ?',
                [grupo]
            );
            console.log(`   ✅ Grupo ${grupo}: ${resultClientes.affectedRows} cliente(s) eliminado(s)`);
        }

        // 3. Marcar pedidos_comuns como processados
        console.log('\n✔️  Marcando pedidos_comuns como processados...');
        for (const grupo of GRUPOS_LIMPAR) {
            const resultPedidosComuns = await query(
                "UPDATE pedidos_comuns SET status = 'PROCESSADO' WHERE grupo_id = ? AND status = 'PENDENTE'",
                [grupo]
            );
            console.log(`   ✅ Grupo ${grupo}: ${resultPedidosComuns.affectedRows} pedido(s) comum(ns) marcado(s)`);
        }

        // 4. Marcar pedidos_diamante como processados
        console.log('\n💎 Marcando pedidos_diamante como processados...');
        for (const grupo of GRUPOS_LIMPAR) {
            const resultPedidosDiamante = await query(
                "UPDATE pedidos_diamante SET status = 'PROCESSADO' WHERE grupo_id = ? AND status = 'PENDENTE'",
                [grupo]
            );
            console.log(`   ✅ Grupo ${grupo}: ${resultPedidosDiamante.affectedRows} pedido(s) diamante marcado(s)`);
        }

        console.log('\n✅ Limpeza concluída com sucesso!');

        // Mostrar resumo final
        console.log('\n📊 Verificando estado final...');
        for (const grupo of GRUPOS_LIMPAR) {
            const [countPacotes] = await query(
                'SELECT COUNT(*) as total FROM pacotes WHERE grupo_id = ?',
                [grupo]
            );
            const [countClientes] = await query(
                'SELECT COUNT(*) as total FROM pacotes_clientes WHERE grupo_id = ?',
                [grupo]
            );
            const [countPedidosComuns] = await query(
                "SELECT COUNT(*) as total FROM pedidos_comuns WHERE grupo_id = ? AND status = 'PENDENTE'",
                [grupo]
            );
            const [countPedidosDiamante] = await query(
                "SELECT COUNT(*) as total FROM pedidos_diamante WHERE grupo_id = ? AND status = 'PENDENTE'",
                [grupo]
            );

            console.log(`\n   Grupo: ${grupo}`);
            console.log(`   - Pacotes: ${countPacotes[0].total}`);
            console.log(`   - Clientes: ${countClientes[0].total}`);
            console.log(`   - Pedidos comuns pendentes: ${countPedidosComuns[0].total}`);
            console.log(`   - Pedidos diamante pendentes: ${countPedidosDiamante[0].total}`);
        }

    } catch (error) {
        console.error('❌ Erro ao limpar dados:', error.message);
        throw error;
    } finally {
        await pool.end();
        console.log('\n🔌 Conexão encerrada');
    }
}

// Executar
limparDadosGrupos();
