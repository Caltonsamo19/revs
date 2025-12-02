// ============================================================================
// ROTAS - PACOTES AUTOMÁTICOS
// Gestão de pacotes renováveis e histórico de renovações
// ============================================================================

const express = require('express');
const router = express.Router();
const db = require('../database');

// ============================================================================
// HELPER: Converter ISO datetime para MySQL datetime
// ============================================================================
function toMySQLDateTime(isoString) {
    if (!isoString) return null;
    try {
        const date = new Date(isoString);
        return date.toISOString().slice(0, 19).replace('T', ' ');
    } catch (error) {
        console.error('❌ Erro ao converter datetime:', error.message);
        return null;
    }
}

// ============================================================================
// GET /api/pacotes/ativos - Buscar pacotes ativos
// ============================================================================
router.get('/ativos', async (req, res) => {
    try {
        const [rows] = await db.pool.execute(
            `SELECT * FROM pacotes WHERE status = 'ativo' ORDER BY data_inicio DESC`
        );

        console.log(`📦 ${rows.length} pacotes ativos encontrados`);

        return res.json({
            success: true,
            pacotes: rows,
            total: rows.length
        });

    } catch (error) {
        console.error('❌ Erro ao buscar pacotes ativos:', error.message);
        return res.json({
            success: false,
            error: error.message,
            pacotes: []
        });
    }
});

// ============================================================================
// GET /api/pacotes/todos - Buscar TODOS os pacotes (para debug)
// ============================================================================
router.get('/todos', async (req, res) => {
    try {
        const [rows] = await db.pool.execute(
            `SELECT * FROM pacotes ORDER BY created_at DESC LIMIT 100`
        );

        console.log(`📦 ${rows.length} pacotes encontrados no total`);

        return res.json({
            success: true,
            pacotes: rows,
            total: rows.length
        });

    } catch (error) {
        console.error('❌ Erro ao buscar todos pacotes:', error.message);
        return res.json({
            success: false,
            error: error.message,
            pacotes: []
        });
    }
});

// ============================================================================
// POST /api/pacotes - Criar/Atualizar pacote
// ============================================================================
router.post('/', async (req, res) => {
    try {
        const {
            cliente_id, numero, referencia_original, grupo_id, tipo_pacote,
            dias_total, dias_restantes, megas_iniciais, valor_mt_inicial,
            data_inicio, data_expiracao, hora_envio_original,
            proxima_renovacao, renovacoes, status, ultima_renovacao
        } = req.body;

        // Verificar se já existe
        const [existing] = await db.pool.execute(
            'SELECT id FROM pacotes WHERE cliente_id = ?',
            [cliente_id]
        );

        if (existing.length > 0) {
            // Atualizar
            await db.pool.execute(
                `UPDATE pacotes SET
                    numero = ?, grupo_id = ?, tipo_pacote = ?, dias_total = ?,
                    dias_restantes = ?, megas_iniciais = ?, valor_mt_inicial = ?,
                    data_expiracao = ?, proxima_renovacao = ?, renovacoes = ?,
                    status = ?, ultima_renovacao = ?
                WHERE cliente_id = ?`,
                [numero, grupo_id, tipo_pacote, dias_total, dias_restantes,
                 megas_iniciais, valor_mt_inicial,
                 toMySQLDateTime(data_expiracao),
                 toMySQLDateTime(proxima_renovacao),
                 renovacoes, status,
                 toMySQLDateTime(ultima_renovacao),
                 cliente_id]
            );

            console.log(`✅ Pacote atualizado: ${cliente_id}`);
        } else {
            // Inserir novo
            await db.pool.execute(
                `INSERT INTO pacotes
                (cliente_id, numero, referencia_original, grupo_id, tipo_pacote,
                 dias_total, dias_restantes, megas_iniciais, valor_mt_inicial,
                 data_inicio, data_expiracao, hora_envio_original,
                 proxima_renovacao, renovacoes, status, ultima_renovacao)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [cliente_id, numero, referencia_original, grupo_id, tipo_pacote,
                 dias_total, dias_restantes, megas_iniciais, valor_mt_inicial,
                 toMySQLDateTime(data_inicio),
                 toMySQLDateTime(data_expiracao),
                 toMySQLDateTime(hora_envio_original),
                 toMySQLDateTime(proxima_renovacao),
                 renovacoes, status,
                 toMySQLDateTime(ultima_renovacao)]
            );

            console.log(`✅ Pacote criado: ${cliente_id}`);
        }

        return res.json({
            success: true,
            message: 'Pacote salvo com sucesso',
            cliente_id: cliente_id
        });

    } catch (error) {
        console.error('❌ Erro ao salvar pacote:', error.message);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// POST /api/pacotes/renovacao - Registrar renovação
// ============================================================================
router.post('/renovacao', async (req, res) => {
    try {
        const {
            cliente_id, numero, referencia_original, nova_referencia,
            dia, dias_restantes, proxima_renovacao, timestamp_renovacao, grupo_id
        } = req.body;

        await db.pool.execute(
            `INSERT INTO renovacoes_pacotes
            (cliente_id, numero, referencia_original, nova_referencia,
             dia, dias_restantes, proxima_renovacao, timestamp_renovacao, grupo_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [cliente_id, numero, referencia_original, nova_referencia,
             dia, dias_restantes,
             toMySQLDateTime(proxima_renovacao),
             toMySQLDateTime(timestamp_renovacao),
             grupo_id]
        );

        console.log(`✅ Renovação registrada: ${nova_referencia}`);

        return res.json({
            success: true,
            message: 'Renovação registrada com sucesso',
            nova_referencia: nova_referencia
        });

    } catch (error) {
        console.error('❌ Erro ao registrar renovação:', error.message);
        return res.json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// GET /api/pacotes/renovacoes/verificar/:referencia - Verificar se renovação existe
// ============================================================================
router.get('/renovacoes/verificar/:referencia', async (req, res) => {
    try {
        const { referencia } = req.params;

        const [rows] = await db.pool.execute(
            'SELECT COUNT(*) as total FROM renovacoes_pacotes WHERE nova_referencia = ?',
            [referencia]
        );

        const existe = rows[0].total > 0;

        console.log(`🔍 Verificação ${referencia}: ${existe ? 'EXISTE' : 'NÃO EXISTE'}`);

        return res.json({
            success: true,
            existe: existe,
            referencia: referencia
        });

    } catch (error) {
        console.error('❌ Erro ao verificar renovação:', error.message);
        return res.json({
            success: false,
            existe: false,
            error: error.message
        });
    }
});

// ============================================================================
// GET /api/pacotes/renovacoes/recentes?horas=48 - Buscar renovações recentes
// ============================================================================
router.get('/renovacoes/recentes', async (req, res) => {
    try {
        const horas = parseInt(req.query.horas) || 48;
        const dataLimite = new Date(Date.now() - (horas * 60 * 60 * 1000));

        const [rows] = await db.pool.execute(
            `SELECT nova_referencia as novaReferencia,
                    timestamp_renovacao as timestamp
             FROM renovacoes_pacotes
             WHERE timestamp_renovacao >= ?
             ORDER BY timestamp_renovacao DESC`,
            [dataLimite]
        );

        console.log(`📦 ${rows.length} renovações encontradas nas últimas ${horas}h`);

        return res.json({
            success: true,
            renovacoes: rows,
            total: rows.length,
            periodo_horas: horas
        });

    } catch (error) {
        console.error('❌ Erro ao buscar renovações recentes:', error.message);
        return res.json({
            success: false,
            renovacoes: [],
            error: error.message
        });
    }
});

module.exports = router;
