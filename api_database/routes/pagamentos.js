// ============================================================================
// ROTAS - PAGAMENTOS
// Compatível 100% com Google Apps Script (mesmas actions e respostas)
// ============================================================================

const express = require('express');
const router = express.Router();
const db = require('../database');

// ============================================================================
// POST /api/pagamentos - Endpoint principal
// ============================================================================
router.post('/', async (req, res) => {
    try {
        const data = req.body;

        // ========== BUSCAR POR REFERÊNCIA ==========
        if (data.action === "buscar_por_referencia") {
            return await buscarPorReferencia(data.referencia, data.valor, res);
        }

        // ========== MARCAR COMO PROCESSADO ==========
        if (data.action === "marcar_processado") {
            return await marcarProcessado(data.referencia, data.valor, res);
        }

        // ========== BUSCAR PENDENTES ==========
        if (data.action === "buscar_pendentes") {
            return await buscarPendentes(data.grupo_id, res);
        }

        // ========== BUSCAR PAGAMENTOS 24H ==========
        if (data.action === "buscar_pagamentos_24h") {
            return await buscarPagamentos24h(data.grupo_id, data.data_inicio, data.data_fim, res);
        }

        // ========== INSERIR NOVO PAGAMENTO ==========
        let transacao;

        // Verificar se é do bot de divisão
        if (data.sender === "WhatsApp-Bot-Divisao" && data.transacao) {
            transacao = data.transacao;
        } else if (data.transacao) {
            transacao = data.transacao;
        } else {
            // Para SMS normais, usar o processamento tradicional
            transacao = gerarFormatoFinal(data.message);
        }

        const partes = transacao.split('|');
        const referencia = partes[0] ? partes[0].trim() : null;
        const valor = partes[1] ? normalizarValor(partes[1]) : 0;
        const numero = partes[2] ? partes[2].trim() : '';

        if (!referencia) {
            return res.json({
                success: false,
                error: 'Não foi possível extrair a referência dos dados'
            });
        }

        // Verificar duplicata
        const [existing] = await db.pool.execute(
            'SELECT id, status FROM pagamentos WHERE referencia = ?',
            [referencia]
        );

        if (existing.length > 0) {
            console.log(`⚠️ Pagamento duplicado: ${referencia}`);
            return res.json({
                success: false,
                duplicado: true,
                referencia: referencia,
                status_existente: 'IGNORADO',
                message: 'Pagamento duplicado detectado'
            });
        }

        // Inserir pagamento
        await db.pool.execute(
            `INSERT INTO pagamentos
            (referencia, valor, numero, transacao, status, grupo_id, sender, message)
            VALUES (?, ?, ?, ?, 'PENDENTE', ?, ?, ?)`,
            [referencia, valor, numero, transacao, data.grupo_id, data.sender, data.message]
        );

        console.log(`✅ Pagamento inserido: ${referencia}`);

        return res.json({
            success: true,
            dados: transacao,
            status: 'PENDENTE',
            message: 'Pagamento salvo com sucesso',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro:', error.message);
        return res.json({
            success: false,
            error: error.message,
            message: 'Erro ao processar pagamento'
        });
    }
});

// ============================================================================
// BUSCAR PAGAMENTO POR REFERÊNCIA E VALOR
// ============================================================================
async function buscarPorReferencia(referencia, valorEsperado, res) {
    try {
        const valorNormalizado = normalizarValor(valorEsperado);

        console.log(`🔍 Buscando pagamento: ${referencia} - Valor: ${valorNormalizado}`);

        const [rows] = await db.pool.execute(
            'SELECT id, transacao, valor, status, timestamp FROM pagamentos WHERE referencia = ?',
            [referencia]
        );

        if (rows.length === 0) {
            console.log(`❌ Pagamento não encontrado: ${referencia}`);
            return res.json({
                encontrado: false,
                referencia: referencia,
                valor: valorEsperado,
                motivo: "Pagamento não encontrado na planilha (busca exata apenas)"
            });
        }

        const pagamento = rows[0];
        const valorEncontrado = normalizarValor(pagamento.valor);

        // Verificar se o valor confere
        if (valorEncontrado !== valorNormalizado) {
            console.log(`❌ Valor não confere: esperado ${valorNormalizado}, encontrado ${valorEncontrado}`);
            return res.json({
                encontrado: false,
                referencia: referencia,
                valor: valorEsperado,
                motivo: "Valor não confere"
            });
        }

        // Se já foi processado
        if (pagamento.status === 'PROCESSADO') {
            console.log(`⚠️ Pagamento já processado: ${referencia}`);
            return res.json({
                encontrado: true,
                ja_processado: true,
                referencia: referencia,
                valor: valorEncontrado,
                linha: pagamento.id,
                timestamp: pagamento.timestamp,
                status: pagamento.status,
                tipo_busca: "exata",
                motivo: "Pagamento já foi processado anteriormente"
            });
        }

        // Pagamento pendente encontrado
        console.log(`✅ Pagamento PENDENTE encontrado: ${referencia}`);
        return res.json({
            encontrado: true,
            referencia: referencia,
            valor: valorEncontrado,
            linha: pagamento.id,
            timestamp: pagamento.timestamp,
            status: "PENDENTE",
            tipo_busca: "exata",
            acao_realizada: "encontrado_pendente"
        });

    } catch (error) {
        console.error('❌ Erro na busca:', error.message);
        return res.json({
            encontrado: false,
            erro: error.message
        });
    }
}

// ============================================================================
// MARCAR PAGAMENTO COMO PROCESSADO
// ============================================================================
async function marcarProcessado(referencia, valorEsperado, res) {
    try {
        const valorNormalizado = normalizarValor(valorEsperado);

        console.log(`🔄 Marcando pagamento como PROCESSADO: ${referencia}`);

        const [result] = await db.pool.execute(
            `UPDATE pagamentos
            SET status = 'PROCESSADO'
            WHERE referencia = ? AND valor = ? AND status = 'PENDENTE'`,
            [referencia, valorNormalizado]
        );

        if (result.affectedRows > 0) {
            console.log(`✅ Pagamento marcado como PROCESSADO: ${referencia}`);
            return res.json({
                success: true,
                referencia: referencia,
                valor: valorNormalizado,
                status: "PROCESSADO",
                message: "Pagamento marcado como processado com sucesso"
            });
        }

        // Verificar se já estava processado
        const [existing] = await db.pool.execute(
            'SELECT status FROM pagamentos WHERE referencia = ?',
            [referencia]
        );

        if (existing.length > 0 && existing[0].status === 'PROCESSADO') {
            return res.json({
                success: true,
                referencia: referencia,
                valor: valorNormalizado,
                status: existing[0].status,
                message: "Pagamento já estava marcado como " + existing[0].status
            });
        }

        return res.json({
            success: false,
            referencia: referencia,
            valor: valorEsperado,
            message: "Pagamento não encontrado na planilha"
        });

    } catch (error) {
        console.error('❌ Erro ao marcar:', error.message);
        return res.json({
            success: false,
            erro: error.message
        });
    }
}

// ============================================================================
// BUSCAR PENDENTES
// ============================================================================
async function buscarPendentes(grupoId, res) {
    try {
        const [rows] = await db.pool.execute(
            'SELECT transacao FROM pagamentos WHERE grupo_id = ? AND status = ?',
            [grupoId, 'PENDENTE']
        );

        // Marcar como processado ao buscar (comportamento original)
        if (rows.length > 0) {
            await db.pool.execute(
                `UPDATE pagamentos SET status = 'PROCESSADO' WHERE grupo_id = ? AND status = 'PENDENTE'`,
                [grupoId]
            );
        }

        const dados = rows.map(row => row.transacao);

        console.log(`📤 Enviando ${dados.length} pagamentos pendentes para grupo: ${grupoId}`);

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
// BUSCAR PAGAMENTOS 24H
// ============================================================================
async function buscarPagamentos24h(grupoId, dataInicio, dataFim, res) {
    try {
        console.log(`💰 Buscando pagamentos 24h - Grupo: ${grupoId}`);

        const [rows] = await db.pool.execute(
            `SELECT transacao FROM pagamentos
            WHERE grupo_id = ?
            AND status = 'PROCESSADO'
            AND timestamp >= ?
            AND timestamp <= ?`,
            [grupoId, new Date(dataInicio), new Date(dataFim)]
        );

        const pagamentos = rows.map(row => row.transacao);

        console.log(`✅ Encontrados ${pagamentos.length} pagamentos nas últimas 24h`);

        return res.json({
            pagamentos: pagamentos,
            total: pagamentos.length,
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
            pagamentos: [],
            total: 0,
            erro: error.message
        });
    }
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

// Normalizar valor (remove vírgulas, converte para número)
function normalizarValor(valor) {
    if (typeof valor === 'number') {
        return valor;
    }

    if (typeof valor === 'string') {
        let valorLimpo = valor.trim();

        // Casos especiais: "1,0000" = 1000
        const regexZeros = /^(\d+),0+$/;
        const matchZeros = valorLimpo.match(regexZeros);
        if (matchZeros) {
            const base = parseInt(matchZeros[1]);
            const zeros = valorLimpo.split(',')[1].length;
            const mult = zeros >= 3 ? 1000 : Math.pow(10, zeros);
            return base * mult;
        }

        // Vírgula como separador de milhares
        const temVirgula3Digitos = /,\d{3}($|\D)/.test(valorLimpo);
        if (temVirgula3Digitos) {
            valorLimpo = valorLimpo.replace(/,(?=\d{3}($|\D))/g, '');
        } else {
            valorLimpo = valorLimpo.replace(',', '.');
        }

        const num = parseFloat(valorLimpo);
        if (isNaN(num)) return valor;

        return (Math.abs(num % 1) < 0.0001) ? Math.round(num) : num;
    }

    return valor;
}

// Extrair dados de pagamento de SMS
function extrairDadosPagamento(mensagem) {
    const resultado = {
        referencia: "",
        valor: 0,
        numero: ""
    };

    // Padrões para referência
    const padroesRef = [
        /Confirmado\s+([A-Z0-9]+)/i,
        /ID da transacao\s*:?\s*([A-Z0-9]+\.[A-Z0-9]+\.[A-Z0-9]+)/i,
        /ID da transacao\s*:?\s*([A-Z0-9]+\.[A-Z0-9]+)/i,
        /ID da transacao\s*:?\s*([A-Z0-9]+)/i,
        /([A-Z]{2}\d+\.[A-Z0-9]+\.[A-Z0-9]+)/,
        /([A-Z]{2}\d+\.[A-Z0-9]+)/,
        /([A-Z0-9]{8,})/
    ];

    // Padrões para valor
    const padroesValor = [
        /Transferiste\s+(\d+(?:,\d{3})*(?:\.\d+)?)MT/i,
        /(\d+(?:,\d{3})*(?:\.\d+)?)\s*MT/i
    ];

    // Padrões para número
    const padroesNumero = [
        /para\s+(\d{9})\s+-/i,
        /conta\s+(\d{9})/i,
        /\b(8[0-9]{8})\b/
    ];

    // Extrair referência
    for (const padrao of padroesRef) {
        const match = mensagem.match(padrao);
        if (match && match[1].length >= 3) {
            resultado.referencia = match[1];
            break;
        }
    }

    // Extrair valor
    for (const padrao of padroesValor) {
        const match = mensagem.match(padrao);
        if (match) {
            let valorStr = match[1].replace(/,(?=\d{3})/g, '');
            resultado.valor = parseFloat(valorStr.replace(',', '.'));
            if (resultado.valor % 1 === 0) {
                resultado.valor = parseInt(resultado.valor);
            }
            break;
        }
    }

    // Extrair número
    for (const padrao of padroesNumero) {
        const match = mensagem.match(padrao);
        if (match && match[1].length === 9) {
            resultado.numero = match[1];
            break;
        }
    }

    return resultado;
}

// Gerar formato final REF|VALOR|NUMERO
function gerarFormatoFinal(mensagem) {
    const dados = extrairDadosPagamento(mensagem);

    let refLimpa = dados.referencia;
    if (refLimpa) {
        refLimpa = refLimpa.replace(/\.+$/, '').trim();
    }

    return `${refLimpa}|${dados.valor}|${dados.numero}`;
}

module.exports = router;
