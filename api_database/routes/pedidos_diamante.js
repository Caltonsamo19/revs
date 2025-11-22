// ============================================================================
// ROTAS - PEDIDOS DIAMANTE
// Compatível 100% com Google Apps Script (mesmas actions e respostas)
// ============================================================================

const express = require('express');
const router = express.Router();
const db = require('../database');

// Mapeamento de códigos para nomes
const nomesPacotes = {
    '1': 'Diamante',
    '2': 'Pacote 2.8GB'
};

// ============================================================================
// POST /api/diamante - Endpoint principal
// ============================================================================
router.post('/', async (req, res) => {
    try {
        const data = req.body;

        // ========== BUSCAR PEDIDOS PENDENTES ==========
        if (data.action === "buscar_pendentes") {
            return await buscarPendentes(data.grupo_id, res);
        }

        // ========== CONFIRMAR RECEBIMENTO ==========
        if (data.action === "confirmar_recebimento") {
            return await confirmarRecebimento(data.referencias, data.grupo_id, res);
        }

        // ========== REVERTER PARA PENDENTE ==========
        if (data.action === "reverter_pendentes") {
            return await reverterPendentes(data.referencias, data.grupo_id, res);
        }

        // ========== BUSCAR PEDIDOS 24H ==========
        if (data.action === "buscar_pedidos_24h") {
            return await buscarPedidos24h(data.grupo_id, data.data_inicio, data.data_fim, res);
        }

        // ========== INSERIR NOVO PEDIDO DIAMANTE ==========
        const transacao = data.transacao;
        const partes = transacao.split('|');
        const referencia = partes[0] ? partes[0].trim() : null;
        const codigo = partes[1] ? partes[1].trim() : '';
        const numero = partes[2] ? partes[2].trim() : '';

        const nomePacote = nomesPacotes[codigo] || 'Especial';

        if (!referencia) {
            return res.json({
                success: false,
                error: 'Não foi possível extrair a referência dos dados'
            });
        }

        // Verificar duplicata
        const [existing] = await db.pool.execute(
            'SELECT id, status FROM pedidos_diamante WHERE referencia = ?',
            [referencia]
        );

        if (existing.length > 0) {
            console.log(`⚠️ Pedido ${nomePacote} duplicado: ${referencia}`);
            return res.json({
                success: false,
                duplicado: true,
                referencia: referencia,
                codigo: codigo,
                status_existente: existing[0].status,
                message: `Pedido ${nomePacote} já existe na planilha (Status: ${existing[0].status})`
            });
        }

        // Inserir pedido
        await db.pool.execute(
            `INSERT INTO pedidos_diamante
            (referencia, codigo, numero, transacao, status, grupo_id, sender, message)
            VALUES (?, ?, ?, ?, 'PENDENTE', ?, ?, ?)`,
            [referencia, codigo, numero, transacao, data.grupo_id, data.sender, data.message]
        );

        console.log(`✨ Pedido ${nomePacote} inserido: ${referencia}`);

        return res.json({
            success: true,
            referencia: referencia,
            message: 'Pedido diamante inserido com sucesso',
            dados: transacao,
            timestamp: new Date().toLocaleString('pt-BR')
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// BUSCAR PEDIDOS PENDENTES
// ============================================================================
async function buscarPendentes(grupoId, res) {
    try {
        const [rows] = await db.pool.execute(
            'SELECT transacao FROM pedidos_diamante WHERE grupo_id = ? AND status = ?',
            [grupoId, 'PENDENTE']
        );

        const dados = rows.map(row => row.transacao);

        console.log(`📤 Enviando ${dados.length} pedidos diamante pendentes para grupo: ${grupoId}`);

        return res.json({
            dados: dados,
            total: dados.length,
            grupo: grupoId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro na busca:', error.message);
        return res.json({
            erro: error.message,
            dados: [],
            total: 0
        });
    }
}

// ============================================================================
// CONFIRMAR RECEBIMENTO (MARCAR COMO PROCESSADO)
// ============================================================================
async function confirmarRecebimento(referencias, grupoId, res) {
    try {
        console.log(`✅ Confirmação diamante recebida - Grupo: ${grupoId}`);

        let processados = 0;
        const detalhes = [];

        for (const referencia of referencias) {
            const [result] = await db.pool.execute(
                `UPDATE pedidos_diamante
                SET status = 'PROCESSADO'
                WHERE referencia = ? AND grupo_id = ? AND status = 'PENDENTE'`,
                [referencia, grupoId]
            );

            if (result.affectedRows > 0) {
                processados++;
                detalhes.push({
                    referencia: referencia,
                    status: 'PROCESSADO'
                });
                console.log(`✅ Ref ${referencia} marcada como PROCESSADO`);
            }
        }

        return res.json({
            success: true,
            grupo_id: grupoId,
            referencias_confirmadas: referencias,
            total_confirmado: referencias.length,
            processados: processados,
            detalhes: detalhes,
            message: `${processados} pedidos diamante marcados como PROCESSADO com sucesso`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro ao confirmar:', error.message);
        return res.json({
            success: false,
            error: error.message,
            grupo_id: grupoId || 'N/A',
            referencias_confirmadas: referencias || [],
            processados: 0,
            detalhes: [],
            message: 'Erro ao confirmar recebimento diamante'
        });
    }
}

// ============================================================================
// REVERTER PEDIDOS PARA PENDENTE
// ============================================================================
async function reverterPendentes(referencias, grupoId, res) {
    try {
        console.log(`🔄 Revertendo pedidos diamante - Grupo: ${grupoId}`);

        let revertidos = 0;
        const detalhes = [];

        for (const referencia of referencias) {
            const [result] = await db.pool.execute(
                `UPDATE pedidos_diamante
                SET status = 'PENDENTE'
                WHERE referencia = ? AND grupo_id = ? AND status = 'PROCESSADO'`,
                [referencia, grupoId]
            );

            if (result.affectedRows > 0) {
                revertidos++;
                detalhes.push({
                    referencia: referencia,
                    status: 'PENDENTE'
                });
                console.log(`✅ Ref ${referencia} revertida para PENDENTE`);
            }
        }

        return res.json({
            success: true,
            grupo_id: grupoId,
            referencias_solicitadas: referencias,
            total_solicitado: referencias.length,
            revertidos: revertidos,
            detalhes: detalhes,
            message: `${revertidos} pedidos diamante revertidos para PENDENTE com sucesso`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro ao reverter:', error.message);
        return res.json({
            success: false,
            error: error.message,
            grupo_id: grupoId || 'N/A',
            referencias_solicitadas: referencias || [],
            revertidos: 0,
            detalhes: [],
            message: 'Erro ao reverter pedidos diamante'
        });
    }
}

// ============================================================================
// BUSCAR PEDIDOS DAS ÚLTIMAS 24H
// ============================================================================
async function buscarPedidos24h(grupoId, dataInicio, dataFim, res) {
    try {
        console.log(`📦 Buscando pedidos diamante 24h - Grupo: ${grupoId}`);

        const [rows] = await db.pool.execute(
            `SELECT transacao FROM pedidos_diamante
            WHERE grupo_id = ?
            AND status = 'PROCESSADO'
            AND timestamp >= ?
            AND timestamp <= ?`,
            [grupoId, new Date(dataInicio), new Date(dataFim)]
        );

        const pedidos = rows.map(row => row.transacao);

        console.log(`✅ Encontrados ${pedidos.length} pedidos diamante nas últimas 24h`);

        return res.json({
            pedidos: pedidos,
            total: pedidos.length,
            grupo: grupoId,
            periodo: {
                inicio: dataInicio,
                fim: dataFim
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro ao buscar 24h:', error.message);
        return res.json({
            pedidos: [],
            total: 0,
            erro: error.message
        });
    }
}

module.exports = router;
