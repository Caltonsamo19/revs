// ============================================================================
// API MARIADB - BOT WHATSAPP RETALHO
// Substitui Google Sheets por banco de dados local
// Compatível 100% com Tasker (mesmos endpoints e respostas)
// ============================================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./database');

// Importar rotas
const pedidosComuns = require('./routes/pedidos_comuns');
const pedidosDiamante = require('./routes/pedidos_diamante');
const pagamentos = require('./routes/pagamentos');
const pacotes = require('./routes/pacotes');

const app = express();
const PORT = process.env.API_PORT || 3002;

// Middleware
app.use(cors());

// Middleware personalizado para JSON com tratamento de erros
app.use(express.json({
    verify: (req, res, buf, encoding) => {
        try {
            JSON.parse(buf);
        } catch(e) {
            console.error(`❌ JSON inválido recebido: ${buf.toString().substring(0, 100)}`);
            throw new Error('JSON inválido');
        }
    }
}));

// Error handler para JSON malformado (deve vir logo após express.json())
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('❌ Erro de parse JSON:', err.message);
        return res.status(400).json({
            success: false,
            error: 'JSON inválido recebido',
            message: 'Verifique se a variável %JSON_PAYLOAD está sendo preenchida corretamente no Tasker'
        });
    }
    next(err);
});

// Log de requisições
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ============================================================================
// ROTAS - Compatíveis com Google Apps Script
// ============================================================================

// Pedidos Comuns (substitui script de pedidos)
app.use('/api/pedidos', pedidosComuns);

// Pedidos Diamante (substitui script diamante)
app.use('/api/diamante', pedidosDiamante);

// Pagamentos (substitui script de pagamentos)
app.use('/api/pagamentos', pagamentos);

// Pacotes automáticos
app.use('/api/pacotes', pacotes);

// Health check
app.get('/health', async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({
            status: 'ok',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            database: 'disconnected',
            error: error.message
        });
    }
});

// Rota padrão
app.get('/', (req, res) => {
    res.json({
        name: 'Bot Retalho API',
        version: '1.0.0',
        endpoints: {
            pedidos: '/api/pedidos',
            diamante: '/api/diamante',
            pagamentos: '/api/pagamentos',
            pacotes: '/api/pacotes',
            health: '/health'
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('❌ Erro:', err.message);
    res.status(500).json({
        success: false,
        error: err.message
    });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log('============================================');
    console.log('🚀 Bot Retalho API - MariaDB');
    console.log(`📍 Rodando em http://0.0.0.0:${PORT}`);
    console.log('============================================');
    console.log('📦 Endpoints disponíveis:');
    console.log(`   POST /api/pedidos`);
    console.log(`   POST /api/diamante`);
    console.log(`   POST /api/pagamentos`);
    console.log(`   GET/POST /api/pacotes`);
    console.log('============================================');
});

module.exports = app;
