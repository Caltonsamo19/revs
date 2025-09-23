require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const axios = require('axios'); // npm install axios

// === IMPORTAR A IA ===
const WhatsAppAI = require('./whatsapp_ai');

// === CONFIGURAÇÃO GOOGLE SHEETS - BOT RETALHO (SCRIPT PRÓPRIO) ===
const GOOGLE_SHEETS_CONFIG = {
    scriptUrl: process.env.GOOGLE_SHEETS_SCRIPT_URL_RETALHO || 'https://script.google.com/macros/s/AKfycbyMilUC5bYKGXV95LR4MmyaRHzMf6WCmXeuztpN0tDpQ9_2qkgCxMipSVqYK_Q6twZG/exec',
    planilhaUrl: 'https://docs.google.com/spreadsheets/d/1vIv1Y0Hiu6NHEG37ubbFoa_vfbEe6sAb9I4JH-P38BQ/edit',
    planilhaId: '1vIv1Y0Hiu6NHEG37ubbFoa_vfbEe6sAb9I4JH-P38BQ',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 2000
};

// === CONFIGURAÇÃO SCRIPT DE PAGAMENTOS ===
const SCRIPT_PAGAMENTOS_CONFIG = {
    scriptUrl: process.env.GOOGLE_SHEETS_PAGAMENTOS || 'https://script.google.com/macros/s/AKfycbzzifHGu1JXc2etzG3vqK5Jd3ihtULKezUTQQIDJNsr6tXx3CmVmKkOlsld0x1Feo0H/exec',
    timeout: 30000
};

console.log(`📊 Google Sheets configurado: ${GOOGLE_SHEETS_CONFIG.scriptUrl}`);
console.log(`🔍 Script Pagamentos configurado: ${SCRIPT_PAGAMENTOS_CONFIG.scriptUrl}`);

// Criar instância do cliente
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "bot_retalho_modificado" // Diferente do bot atacado
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// === INICIALIZAR A IA ===
require('dotenv').config();
const ia = new WhatsAppAI(process.env.OPENAI_API_KEY);

// Configuração para encaminhamento
const ENCAMINHAMENTO_CONFIG = {
    grupoOrigem: '120363152151047451@g.us', // Phull Megas
    numeroDestino: '258861645968@c.us',
    intervaloSegundos: 2
};

// Fila de mensagens para encaminhar
let filaMensagens = [];
let processandoFila = false;

// === VARIÁVEIS PARA DADOS ===
let dadosParaTasker = [];

// Base de dados de compradores
let historicoCompradores = {};
const ARQUIVO_HISTORICO = 'historico_compradores.json';

// === SISTEMA DE PACOTES AUTOMÁTICOS ===
const SistemaPacotes = require('./sistema_pacotes');
let sistemaPacotes = null;

// Inicializar sistema de pacotes se habilitado
if (process.env.SISTEMA_PACOTES_ENABLED === 'true') {
    console.log('📦 Inicializando Sistema de Pacotes Automáticos...');
    sistemaPacotes = new SistemaPacotes();
} else {
    console.log('📦 Sistema de Pacotes Automáticos desabilitado');
}

// Cache de administradores dos grupos
let adminCache = {};

// Cache para evitar logs repetidos de grupos
let gruposLogados = new Set();

// Configuração de administradores GLOBAIS
const ADMINISTRADORES_GLOBAIS = [
    '258874100607@c.us',
    '258871112049@c.us',
    '258845356399@c.us', 
    '258840326152@c.us', 
    '258852118624@c.us'
];

// === CONFIGURAÇÃO DE MODERAÇÃO ===
const MODERACAO_CONFIG = {
    ativado: {
        '258820749141-1441573529@g.us': true,
        '120363152151047451@g.us': true,
        '258840161370-1471468657@g.us': true
    },
    detectarLinks: true,
    apagarMensagem: true,
    removerUsuario: true,
    excecoes: [
        '258861645968@c.us',
        '258871112049@c.us', 
        '258852118624@c.us'
    ]
};

// Configuração para cada grupo
const CONFIGURACAO_GRUPOS = {
    '120363023150137820@g.us': {
    nome: 'NET VODACOM ACESSÍVEL',
    tabela: `🚨📱 INTERNET VODACOM COM OS MELHORES PREÇOS!
Mega Promoção da NET DA VODACOM ACESSÍVEL — Conecte-se já! 🚀

📅 PACOTES DIÁRIOS (24h de validade)

✅ 1GB - 17MT
✅ 2GB - 34MT
✅ 3GB - 51MT
✅ 4GB - 68MT
✅ 5GB - 85MT
✅ 6GB - 102MT
✅ 7GB - 119MT
✅ 8GB - 136MT
✅ 9GB - 153MT
✅ 10GB - 170MT


📅 PACOTES SEMANAIS 
⚠ Vai receber 100MB por dia durante 7 dias, totalizando +0.7GB

✅ 2GB – 55MT
✅ 3GB – 75MT
✅ 5GB – 130MT
✅ 10GB – 220MT



📅 PACOTES MENSAIS 
⚠ Não deve ter txuna crédito ⚠

✅ 5GB – 165MT
✅ 10GB – 280MT
✅ 20GB – 480MT
✅ 30GB – 760MT
✅ 50GB – 960MT
✅ 100GB – 1940MT
✅ 200GB – 3420MT

FORMAS DE PAGAMENTO💰💶

📌 M-PESA:  858891101
   Nome:  ISAC DA LURDES

📌 E-MOLA: 866291101
    Nome:   ISAC LURDES 

🚀 O futuro é agora! Vamos? 🔥🛒
`,
    pagamento: `FORMAS DE PAGAMENTO💰💶

📌 M-PESA:  858891101
   Nome:  ISAC DA LURDES

📌 E-MOLA: 866291101
    Nome:  ISAC LURDES 

📮 Após a transferência enviei o comprovante em forma do cópia junto com seu número.
 
> 1. 🚨Não mande comprovativo em formato de imagem 📸🚨

> 2.  🚨 Não mande valor que não têm na tabela🚨

🚀 O futuro é agora! Vamos? 🔥🛒
`
}
};

// === FUNÇÃO GOOGLE SHEETS ===

// Função para retry automático
async function tentarComRetry(funcao, maxTentativas = 3, delay = 2000) {
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
            return await funcao();
        } catch (error) {
            console.log(`⚠️ Tentativa ${tentativa}/${maxTentativas} falhou: ${error.message}`);
            
            if (tentativa === maxTentativas) {
                throw error; // Última tentativa, propagar erro
            }
            
            // Aguardar antes da próxima tentativa
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}
// === FUNÇÃO PARA NORMALIZAR VALORES ===
function normalizarValor(valor) {
    if (typeof valor === 'number') {
        return valor;
    }

    if (typeof valor === 'string') {
        const valorLimpo = valor.trim ? valor.trim() : valor;

        // Casos especiais: valores com múltiplos zeros após vírgula (ex: "1,0000" = 1000MT)
        const regexZerosAposVirgula = /^(\d+),0+$/;
        const matchZeros = valorLimpo.match(regexZerosAposVirgula);
        if (matchZeros) {
            const baseNumero = parseInt(matchZeros[1]);
            const numeroZeros = valorLimpo.split(',')[1].length;
            const multiplicador = numeroZeros >= 3 ? 1000 : Math.pow(10, numeroZeros);
            return baseNumero * multiplicador;
        }

        // Detectar se vírgula é separador de milhares ou decimal
        const temVirgulaSeguida3Digitos = /,\d{3}($|\D)/.test(valorLimpo);

        let valorFinal = valorLimpo;
        if (temVirgulaSeguida3Digitos) {
            // Vírgula como separador de milhares: "1,000" ou "10,500.50"
            valorFinal = valorLimpo.replace(/,(?=\d{3}($|\D))/g, '');
        } else {
            // Vírgula como separador decimal: "1,50" → "1.50"
            valorFinal = valorLimpo.replace(',', '.');
        }

        const valorNumerico = parseFloat(valorFinal);

        if (isNaN(valorNumerico)) {
            console.log('⚠️ Valor não pôde ser normalizado: "' + valor + '"');
            return valor;
        }

        // Retorna inteiro se não tem decimais significativos
        return (Math.abs(valorNumerico % 1) < 0.0001) ? Math.round(valorNumerico) : valorNumerico;
    }

    return valor;
}

// === FUNÇÃO PARA VERIFICAR PAGAMENTO NA PLANILHA ===
async function verificarPagamento(referencia, valorEsperado) {
    try {
        // Normalizar valor antes da verificação
        const valorNormalizado = normalizarValor(valorEsperado);

        console.log(`🔍 Verificando pagamento ${referencia} - ${valorNormalizado}MT (original: ${valorEsperado})`);

        const response = await axios.post(SCRIPT_PAGAMENTOS_CONFIG.scriptUrl, {
            action: "buscar_por_referencia",
            referencia: referencia,
            valor: valorNormalizado
        }, {
            timeout: SCRIPT_PAGAMENTOS_CONFIG.timeout,
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.encontrado) {
            // VERIFICAR SE PAGAMENTO JÁ FOI PROCESSADO
            if (response.data.ja_processado) {
                console.log(`⚠️ Pagamento já foi processado anteriormente!`);
                return 'ja_processado';
            }

            console.log(`✅ Pagamento encontrado e marcado como processado!`);
            return true;
        }

        console.log(`❌ Pagamento não encontrado`);
        return false;

    } catch (error) {
        console.error(`❌ Erro ao verificar pagamento:`, error.message);
        return false;
    }
}

// === FUNÇÃO PARA VERIFICAR PAGAMENTO COM RETRY SYSTEM ===
async function verificarPagamentoComRetry(referencia, valorEsperado, messageContext = null) {
    const delays = [30000, 45000, 60000]; // 30s, 45s, 60s
    let tentativa = 0;

    console.log(`🔍 Iniciando verificação de pagamento com retry: ${referencia} - ${valorEsperado}MT`);

    // Primeira tentativa imediata
    let resultado = await verificarPagamento(referencia, valorEsperado);

    if (resultado === 'ja_processado' || resultado === true) {
        return resultado;
    }

    // Retry com delays crescentes
    for (const delay of delays) {
        tentativa++;
        console.log(`⏳ Retry ${tentativa}/3 - Aguardando ${delay/1000}s antes da próxima tentativa...`);

        // Notificar no grupo sobre a tentativa de retry (se context disponível)
        if (messageContext) {
            try {
                await client.sendMessage(messageContext.grupoId,
                    `🔍 Tentativa ${tentativa}/3 de localização do pagamento...\n` +
                    `💰 Referência: ${referencia}\n` +
                    `⏱️ Próxima verificação em ${delay/1000} segundos`
                );
            } catch (error) {
                console.log(`⚠️ Erro ao notificar retry no grupo: ${error.message}`);
            }
        }

        await new Promise(resolve => setTimeout(resolve, delay));

        resultado = await verificarPagamento(referencia, valorEsperado);

        if (resultado === 'ja_processado' || resultado === true) {
            // Pagamento encontrado durante retry
            console.log(`✅ Pagamento encontrado na tentativa ${tentativa}!`);

            // Notificar no grupo sobre sucesso
            if (messageContext) {
                try {
                    await client.sendMessage(messageContext.grupoId,
                        `✅ Pagamento confirmado na tentativa ${tentativa}!\n` +
                        `💰 Referência: ${referencia}\n` +
                        `🔄 Continuando com o processamento...`
                    );
                } catch (error) {
                    console.log(`⚠️ Erro ao notificar sucesso no grupo: ${error.message}`);
                }
            }

            return resultado;
        }

        console.log(`❌ Tentativa ${tentativa} falhou - pagamento não encontrado`);
    }

    // Todas as tentativas falharam
    console.log(`❌ Todas as tentativas de verificação falharam para ${referencia}`);

    // Notificar no grupo sobre falha final
    if (messageContext) {
        try {
            await client.sendMessage(messageContext.grupoId,
                `❌ Pagamento não localizado após 3 tentativas\n` +
                `💰 Referência: ${referencia}\n` +
                `⏱️ Tentativas: 30s, 45s, 60s\n\n` +
                `Por favor, verifique se o pagamento foi efetuado corretamente e tente novamente em breve.`
            );
        } catch (error) {
            console.log(`⚠️ Erro ao notificar falha no grupo: ${error.message}`);
        }

        // Notificar o cliente diretamente
        try {
            await client.sendMessage(messageContext.numeroCliente,
                `⚠️ *PAGAMENTO NÃO LOCALIZADO*\n\n` +
                `💰 Referência: ${referencia}\n` +
                `📊 Valor: ${valorEsperado}MT\n\n` +
                `🔍 O sistema não conseguiu localizar seu pagamento após 3 tentativas.\n\n` +
                `📝 *Por favor:*\n` +
                `• Verifique se o pagamento foi efetuado\n` +
                `• Confirme se a referência está correta\n` +
                `• Tente novamente em alguns minutos\n\n` +
                `💬 Se o problema persistir, entre em contato com o suporte.`
            );
        } catch (error) {
            console.log(`⚠️ Erro ao notificar cliente: ${error.message}`);
        }
    }

    return false;
}

async function enviarParaGoogleSheets(referencia, valor, numero, grupoId, grupoNome, autorMensagem) {
    // Formato igual ao Bot Atacado: transacao já concatenada
    const transacaoFormatada = `${referencia}|${valor}|${numero}`;
    
    const dados = {
        transacao: transacaoFormatada,  // Formato concatenado igual ao Bot Atacado
        grupo_id: grupoId,
        sender: 'WhatsApp-Bot',  // Identificar origem
        message: `Dados enviados pelo Bot: ${transacaoFormatada}`,
        timestamp: new Date().toISOString()
    };
    
    try {
        console.log(`📊 Enviando para Google Sheets [${grupoNome}]: ${referencia}|${valor}|${numero}`);
        console.log(`🔍 Dados enviados:`, JSON.stringify(dados, null, 2));
        console.log(`🔗 URL destino:`, GOOGLE_SHEETS_CONFIG.scriptUrl);
        
       const response = await axios.post(GOOGLE_SHEETS_CONFIG.scriptUrl, dados, {
    timeout: GOOGLE_SHEETS_CONFIG.timeout,
    headers: {
        'Content-Type': 'application/json',
        'X-Bot-Source': 'WhatsApp-Bot'
    },
    // Configuração de retry
    validateStatus: function (status) {
        return status < 500; // Resolve apenas se status < 500
    }
});
        
        // Google Apps Script pode retornar texto simples ou JSON
        let responseText = '';
        if (typeof response.data === 'object') {
            responseText = JSON.stringify(response.data);
            console.log(`📥 Resposta Google Sheets (JSON):`, response.data);
        } else {
            responseText = String(response.data || '');
            console.log(`📥 Resposta Google Sheets: ${responseText}`);
        }

        // Verificar se a resposta indica sucesso
        const isSucesso = responseText.includes('Sucesso!') ||
                         (typeof response.data === 'object' && response.data.status === 'success') ||
                         (typeof response.data === 'object' && response.data.result === 'success') ||
                         response.status === 200;

        if (isSucesso) {
            console.log(`✅ Google Sheets: Dados enviados! | Grupo: ${grupoNome}`);
            const row = typeof response.data === 'object' && response.data.row ? response.data.row : 'N/A';
            return { sucesso: true, row: row };
        } else if (responseText.includes('Erro:') ||
                  (typeof response.data === 'object' && response.data.error)) {
            const errorMsg = typeof response.data === 'object' && response.data.error ?
                           response.data.error : responseText;
            throw new Error(errorMsg);
        } else {
            throw new Error(`Resposta inesperada: ${responseText}`);
        }
        
    } catch (error) {
        console.error(`❌ Erro Google Sheets [${grupoNome}]: ${error.message}`);
        return { sucesso: false, erro: error.message };
    }
}

// === FUNÇÃO PRINCIPAL PARA TASKER ===
async function enviarParaTasker(referencia, valorPagamento, numero, grupoId, autorMensagem, megasCalculados = null, numeroCliente = null) {
    const grupoNome = getConfiguracaoGrupo(grupoId)?.nome || 'Desconhecido';
    const timestamp = new Date().toLocaleString('pt-BR');

    // Usar megasCalculados se fornecido, senão usar valorPagamento
    const valorParaPlanilha = megasCalculados || valorPagamento;
    const linhaCompleta = `${referencia}|${valorParaPlanilha}|${numero}`;

    console.log(`🔍 VERIFICANDO PAGAMENTO [${grupoNome}]: ${referencia} - Valor real: ${valorPagamento}MT`);

    // === VERIFICAR PAGAMENTO COM RETRY SYSTEM ===
    const messageContext = {
        grupoId: grupoId,
        numeroCliente: numeroCliente || autorMensagem || numero + '@c.us'
    };

    const pagamentoConfirmado = await verificarPagamentoComRetry(referencia, valorPagamento, messageContext);

    if (pagamentoConfirmado === 'ja_processado') {
        console.log(`⚠️ Pagamento já processado - ${referencia} (${valorPagamento}MT)`);
        return {
            sucesso: false,
            erro: 'Pagamento já foi processado anteriormente',
            tipo: 'ja_processado'
        };
    }

    if (!pagamentoConfirmado) {
        console.log(`❌ Pagamento não confirmado após retry - ${referencia} (${valorPagamento}MT)`);
        return {
            sucesso: false,
            erro: 'Pagamento não encontrado na planilha após múltiplas tentativas',
            tipo: 'nao_encontrado'
        };
    }

    console.log(`✅ Pagamento confirmado! Processando [${grupoNome}]: ${linhaCompleta}`);
    
    // Armazenar localmente (backup)
    dadosParaTasker.push({
        dados: linhaCompleta,
        grupo_id: grupoId,
        grupo: grupoNome,
        autor: autorMensagem,
        timestamp: timestamp,
        enviado: false,
        metodo: 'pendente'
    });
    
    // === TENTAR GOOGLE SHEETS PRIMEIRO ===
    const resultado = await enviarParaGoogleSheets(referencia, valorParaPlanilha, numero, grupoId, grupoNome, autorMensagem);
    
    if (resultado.sucesso) {
        // Marcar como enviado
        dadosParaTasker[dadosParaTasker.length - 1].enviado = true;
        dadosParaTasker[dadosParaTasker.length - 1].metodo = 'google_sheets';
        dadosParaTasker[dadosParaTasker.length - 1].row = resultado.row;
        console.log(`✅ [${grupoNome}] Enviado para Google Sheets! Row: ${resultado.row}`);
    } else {
        // Fallback para WhatsApp se Google Sheets falhar
        console.log(`🔄 [${grupoNome}] Google Sheets falhou, usando WhatsApp backup...`);
        enviarViaWhatsAppTasker(linhaCompleta, grupoNome, autorMensagem);
        dadosParaTasker[dadosParaTasker.length - 1].metodo = 'whatsapp_backup';
    }
    
    // Backup em arquivo
    await salvarArquivoTasker(linhaCompleta, grupoNome, timestamp);
    
    // Manter apenas últimos 100 registros
    if (dadosParaTasker.length > 100) {
        dadosParaTasker = dadosParaTasker.slice(-100);
    }
    
    return linhaCompleta;
}

function enviarViaWhatsAppTasker(linhaCompleta, grupoNome, autorMensagem) {
    const item = {
        conteudo: linhaCompleta, // Apenas: referencia|valor|numero
        autor: autorMensagem,
        grupo: grupoNome,
        timestamp: Date.now(),
        id: Date.now() + Math.random(),
        tipo: 'tasker_data_backup'
    };

    filaMensagens.push(item);
    console.log(`📱 WhatsApp Backup → Tasker: ${linhaCompleta}`);

    if (!processandoFila) {
        processarFila();
    }
}

async function salvarArquivoTasker(linhaCompleta, grupoNome, timestamp) {
    try {
        // Arquivo principal para Tasker (apenas a linha)
        await fs.appendFile('tasker_input.txt', linhaCompleta + '\n');
        
        // Log completo para histórico
        const logLine = `${timestamp} | ${grupoNome} | ${linhaCompleta}\n`;
        await fs.appendFile('tasker_log.txt', logLine);
        
        console.log(`📁 Arquivo → Backup: ${linhaCompleta}`);
        
    } catch (error) {
        console.error('❌ Erro ao salvar arquivo Tasker:', error);
    }
}

function obterDadosTasker() {
    return dadosParaTasker;
}

function obterDadosTaskerHoje() {
    const hoje = new Date().toDateString();
    return dadosParaTasker.filter(item => {
        const dataItem = new Date(item.timestamp).toDateString();
        return dataItem === hoje;
    });
}

// === FUNÇÕES AUXILIARES ===

function detectarPerguntaPorNumero(mensagem) {
    const texto = mensagem.toLowerCase();
    
    const padroes = [
        /qual\s+(é\s+)?(o\s+)?número/i,
        /número\s+(de\s+)?(contato|suporte|atendimento)/i,
        /como\s+(falar|contactar|entrar em contacto)/i,
        /preciso\s+(de\s+)?(ajuda|suporte|número)/i,
        /onde\s+(posso\s+)?falar/i,
        /tem\s+(número|contacto|suporte)/i,
        /quero\s+falar\s+com/i,
        /atendimento/i,
        /suporte/i,
        /admin/i,
        /administrador/i,
        /responsável/i,
        /quem\s+(é\s+)?responsável/i,
        /como\s+contactar/i,
        /número\s+do\s+admin/i
    ];
    
    return padroes.some(padrao => padrao.test(texto));
}

function isAdministrador(numero) {
    return ADMINISTRADORES_GLOBAIS.includes(numero);
}

function isGrupoMonitorado(chatId) {
    return CONFIGURACAO_GRUPOS.hasOwnProperty(chatId);
}

function getConfiguracaoGrupo(chatId) {
    return CONFIGURACAO_GRUPOS[chatId] || null;
}

async function isAdminGrupo(chatId, participantId) {
    try {
        if (adminCache[chatId] && adminCache[chatId].timestamp > Date.now() - 300000) {
            return adminCache[chatId].admins.includes(participantId);
        }

        const chat = await client.getChatById(chatId);
        const participants = await chat.participants;
        const admins = participants.filter(p => p.isAdmin || p.isSuperAdmin).map(p => p.id._serialized);
        
        adminCache[chatId] = {
            admins: admins,
            timestamp: Date.now()
        };

        return admins.includes(participantId);
    } catch (error) {
        console.error('❌ Erro ao verificar admin do grupo:', error);
        return false;
    }
}

function contemConteudoSuspeito(mensagem) {
    const texto = mensagem.toLowerCase();
    const temLink = /(?:https?:\/\/|www\.|\.com|\.net|\.org|\.br|\.mz|bit\.ly|tinyurl|t\.me|wa\.me|whatsapp\.com|telegram\.me|link|url)/i.test(texto);
    
    return {
        temLink: MODERACAO_CONFIG.detectarLinks && temLink,
        suspeito: MODERACAO_CONFIG.detectarLinks && temLink
    };
}

async function deletarMensagem(message) {
    try {
        await message.delete(true);
        console.log(`🗑️ Mensagem deletada`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao deletar mensagem:', error);
        return false;
    }
}

async function removerParticipante(chatId, participantId, motivo) {
    try {
        const chat = await client.getChatById(chatId);
        await chat.removeParticipants([participantId]);
        console.log(`🚫 Participante removido: ${participantId} - ${motivo}`);
        return true;
    } catch (error) {
        console.error('❌ Erro ao remover participante:', error);
        return false;
    }
}

async function aplicarModeracao(message, motivoDeteccao) {
    const chatId = message.from;
    const authorId = message.author || message.from;
    
    try {
        if (!MODERACAO_CONFIG.ativado[chatId]) {
            return;
        }

        if (MODERACAO_CONFIG.excecoes.includes(authorId) || isAdministrador(authorId)) {
            return;
        }

        const isAdmin = await isAdminGrupo(chatId, authorId);
        if (isAdmin) {
            return;
        }

        console.log(`🚨 MODERAÇÃO: ${motivoDeteccao}`);

        if (MODERACAO_CONFIG.apagarMensagem) {
            await deletarMensagem(message);
        }

        if (MODERACAO_CONFIG.removerUsuario) {
            await removerParticipante(chatId, authorId, motivoDeteccao);
        }

    } catch (error) {
        console.error('❌ Erro durante moderação:', error);
    }
}

// === DETECÇÃO DE GRUPOS ===
async function logGrupoInfo(chatId, evento = 'detectado') {
    try {
        const chat = await client.getChatById(chatId);
        const isGrupoMonitorado = CONFIGURACAO_GRUPOS.hasOwnProperty(chatId);
        
        console.log(`\n🔍 ═══════════════════════════════════════`);
        console.log(`📋 GRUPO ${evento.toUpperCase()}`);
        console.log(`🔍 ═══════════════════════════════════════`);
        console.log(`📛 Nome: ${chat.name}`);
        console.log(`🆔 ID: ${chatId}`);
        console.log(`👥 Participantes: ${chat.participants ? chat.participants.length : 'N/A'}`);
        console.log(`📊 Monitorado: ${isGrupoMonitorado ? '✅ SIM' : '❌ NÃO'}`);
        console.log(`⏰ Data: ${new Date().toLocaleString('pt-BR')}`);
        
        if (!isGrupoMonitorado) {
            console.log(`\n🔧 PARA ADICIONAR ESTE GRUPO:`);
            console.log(`📝 Copie este código para CONFIGURACAO_GRUPOS:`);
            console.log(`\n'${chatId}': {`);
            console.log(`    nome: '${chat.name}',`);
            console.log(`    tabela: \`SUA_TABELA_AQUI\`,`);
            console.log(`    pagamento: \`SUAS_FORMAS_DE_PAGAMENTO_AQUI\``);
            console.log(`},\n`);
        }
        
        console.log(`🔍 ═══════════════════════════════════════\n`);
        
        return {
            id: chatId,
            nome: chat.name,
            participantes: chat.participants ? chat.participants.length : 0,
            monitorado: isGrupoMonitorado
        };
        
    } catch (error) {
        console.error(`❌ Erro ao obter informações do grupo ${chatId}:`, error);
        return null;
    }
}

// === HISTÓRICO DE COMPRADORES ===

async function carregarHistorico() {
    try {
        const data = await fs.readFile(ARQUIVO_HISTORICO, 'utf8');
        historicoCompradores = JSON.parse(data);
        console.log('📊 Histórico carregado!');
    } catch (error) {
        console.log('📊 Criando novo histórico...');
        historicoCompradores = {};
    }
}

async function salvarHistorico() {
    try {
        await fs.writeFile(ARQUIVO_HISTORICO, JSON.stringify(historicoCompradores, null, 2));
        console.log('💾 Histórico salvo!');
    } catch (error) {
        console.error('❌ Erro ao salvar histórico:', error);
    }
}

async function registrarComprador(grupoId, numeroComprador, nomeContato, valorTransferencia) {
    const agora = new Date();
    const timestamp = agora.toISOString();

    if (!historicoCompradores[grupoId]) {
        historicoCompradores[grupoId] = {
            nomeGrupo: getConfiguracaoGrupo(grupoId)?.nome || 'Grupo Desconhecido',
            compradores: {}
        };
    }

    if (!historicoCompradores[grupoId].compradores[numeroComprador]) {
        historicoCompradores[grupoId].compradores[numeroComprador] = {
            primeiraCompra: timestamp,
            ultimaCompra: timestamp,
            totalCompras: 1,
            nomeContato: nomeContato,
            historico: []
        };
    } else {
        historicoCompradores[grupoId].compradores[numeroComprador].ultimaCompra = timestamp;
        historicoCompradores[grupoId].compradores[numeroComprador].totalCompras++;
        historicoCompradores[grupoId].compradores[numeroComprador].nomeContato = nomeContato;
    }

    historicoCompradores[grupoId].compradores[numeroComprador].historico.push({
        data: timestamp,
        valor: valorTransferencia
    });

    if (historicoCompradores[grupoId].compradores[numeroComprador].historico.length > 10) {
        historicoCompradores[grupoId].compradores[numeroComprador].historico =
            historicoCompradores[grupoId].compradores[numeroComprador].historico.slice(-10);
    }

    await salvarHistorico();
    console.log(`💰 Comprador registrado: ${nomeContato} (${numeroComprador}) - ${valorTransferencia}MT`);
}

// === FILA DE MENSAGENS ===

function adicionarNaFila(mensagem, autor, nomeGrupo, timestamp) {
    const item = {
        conteudo: mensagem,
        autor: autor,
        grupo: nomeGrupo,
        timestamp: timestamp,
        id: Date.now() + Math.random()
    };

    filaMensagens.push(item);
    console.log(`📥 Adicionado à fila: ${filaMensagens.length} mensagens`);

    if (!processandoFila) {
        processarFila();
    }
}

async function processarFila() {
    if (processandoFila || filaMensagens.length === 0) {
        return;
    }

    processandoFila = true;
    console.log(`🚀 Processando ${filaMensagens.length} mensagens...`);

    while (filaMensagens.length > 0) {
        const item = filaMensagens.shift();

        try {
            await client.sendMessage(ENCAMINHAMENTO_CONFIG.numeroDestino, item.conteudo);
            console.log(`✅ Encaminhado: ${item.conteudo.substring(0, 50)}...`);

            if (filaMensagens.length > 0) {
                await new Promise(resolve => setTimeout(resolve, ENCAMINHAMENTO_CONFIG.intervaloSegundos * 1000));
            }

        } catch (error) {
            console.error(`❌ Erro ao encaminhar:`, error);
            filaMensagens.unshift(item);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    processandoFila = false;
    console.log(`🎉 Fila processada!`);
}

// === EVENTOS DO BOT ===

client.on('qr', (qr) => {
    console.log('📱 Escaneie o QR Code:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
    console.log('✅ Bot conectado e pronto!');
    console.log('🧠 IA WhatsApp ativa!');
    console.log('📊 Google Sheets configurado!');
    console.log(`🔗 URL: ${GOOGLE_SHEETS_CONFIG.scriptUrl}`);
    console.log('🤖 Bot Retalho - Lógica simples igual ao Bot Atacado!');
    
    await carregarHistorico();
    
    console.log('\n🤖 Monitorando grupos:');
    Object.keys(CONFIGURACAO_GRUPOS).forEach(grupoId => {
        const config = CONFIGURACAO_GRUPOS[grupoId];
        console.log(`   📋 ${config.nome} (${grupoId})`);
    });
    
    console.log('\n🔧 Comandos admin: .ia .stats .sheets .test_sheets .test_grupo .grupos_status .grupos .grupo_atual .test_retry');
    if (sistemaPacotes) {
        console.log('📦 Comandos pacotes: .pacotes .pacotes_stats .validade [numero] .cancelar_pacote [numero] [ref] .criar_pacote [ref] [numero] [dias]');
    }
});

client.on('group-join', async (notification) => {
    try {
        const chatId = notification.chatId;
        
        // Detectar se o bot foi adicionado
        const addedParticipants = notification.recipientIds || [];
        const botInfo = client.info;
        
        if (botInfo && addedParticipants.includes(botInfo.wid._serialized)) {
            console.log(`\n🤖 BOT ADICIONADO A UM NOVO GRUPO!`);
            await logGrupoInfo(chatId, 'BOT ADICIONADO');
            
            setTimeout(async () => {
                try {
                    const isMonitorado = CONFIGURACAO_GRUPOS.hasOwnProperty(chatId);
                    const mensagem = isMonitorado ? 
                        `🤖 *BOT ATIVO E CONFIGURADO!*\n\nEste grupo está monitorado e o sistema automático já está funcionando.\n\n📋 Digite: *tabela* (ver preços)\n💳 Digite: *pagamento* (ver formas)` :
                        `🤖 *BOT CONECTADO!*\n\n⚙️ Este grupo ainda não está configurado.\n🔧 Contacte o administrador para ativação.\n\n📝 ID do grupo copiado no console do servidor.`;
                    
                    await client.sendMessage(chatId, mensagem);
                    console.log(`✅ Mensagem de status enviada`);
                } catch (error) {
                    console.error('❌ Erro ao enviar mensagem de status:', error);
                }
            }, 3000);
        }
        
        // Código original do grupo já configurado
        const configGrupo = getConfiguracaoGrupo(chatId);
        if (configGrupo) {
            console.log(`👋 Novo membro no grupo ${configGrupo.nome}`);
            
            const mensagemBoasVindas = `
🤖 *SISTEMA DE VENDA AUTOMÁTICA 24/7* 

Bem-vindo(a) ao *${configGrupo.nome}*! 

✨ *Aqui usamos sistema automático!*

🛒 *Como comprar:*
1️⃣ Faça o pagamento 
2️⃣ Envie comprovante + número
3️⃣ Receba automaticamente!

📋 Digite: *tabela* (ver preços)
💳 Digite: *pagamento* (ver formas)

⚡ *Atendimento instantâneo!*
            `;
            
            setTimeout(async () => {
                try {
                    await client.sendMessage(chatId, mensagemBoasVindas);
                    console.log(`✅ Mensagem de boas-vindas enviada`);
                } catch (error) {
                    console.error('❌ Erro ao enviar boas-vindas:', error);
                }
            }, 2000);
        }
    } catch (error) {
        console.error('❌ Erro no evento group-join:', error);
    }
});

client.on('message', async (message) => {
    try {
        const isPrivado = !message.from.endsWith('@g.us');
        const isAdmin = isAdministrador(message.from);

        // === COMANDOS ADMINISTRATIVOS ===
        if (isAdmin) {
            const comando = message.body.toLowerCase().trim();

            if (comando === '.ia') {
                const statusIA = ia.getStatusDetalhado();
                await message.reply(statusIA);
                console.log(`🧠 Comando .ia executado`);
                return;
            }

            if (comando === '.stats') {
                let stats = `📊 *ESTATÍSTICAS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                Object.keys(CONFIGURACAO_GRUPOS).forEach(grupoId => {
                    const config = CONFIGURACAO_GRUPOS[grupoId];
                    const dados = historicoCompradores[grupoId];
                    const totalCompradores = dados ? Object.keys(dados.compradores || {}).length : 0;
                    
                    if (totalCompradores > 0) {
                        stats += `🏢 *${config.nome}*\n`;
                        stats += `👥 ${totalCompradores} compradores\n\n`;
                    }
                });
                
                await message.reply(stats);
                return;
            }

            // === COMANDOS GOOGLE SHEETS ===
            if (comando === '.test_sheets') {
                console.log(`🧪 Testando Google Sheets...`);
                
                const resultado = await enviarParaGoogleSheets('TEST123', '99', '842223344', 'test_group', 'Teste Admin', 'TestUser');
                
                if (resultado.sucesso) {
                    await message.reply(`✅ *Google Sheets funcionando!*\n\n📊 URL: ${GOOGLE_SHEETS_CONFIG.scriptUrl}\n📝 Row: ${resultado.row}\n🎉 Dados enviados com sucesso!`);
                } else {
                    await message.reply(`❌ *Google Sheets com problema!*\n\n📊 URL: ${GOOGLE_SHEETS_CONFIG.scriptUrl}\n⚠️ Erro: ${resultado.erro}\n\n🔧 *Verifique:*\n• Script publicado corretamente\n• Permissões do Google Sheets\n• Internet funcionando`);
                }
                return;
            }

            if (comando === '.test_grupo') {
                const grupoAtual = message.from;
                const configGrupo = getConfiguracaoGrupo(grupoAtual);
                
                if (!configGrupo) {
                    await message.reply('❌ Este grupo não está configurado!');
                    return;
                }
                
                console.log(`🧪 Testando Google Sheets para grupo: ${configGrupo.nome}`);
                
                const resultado = await enviarParaGoogleSheets('TEST999', '88', '847777777', grupoAtual, configGrupo.nome, 'TestAdmin');
                
                if (resultado.sucesso) {
                    await message.reply(`✅ *Teste enviado para ${configGrupo.nome}!*\n\n📊 Row: ${resultado.row}\n🔍 O celular deste grupo deve processar em até 30 segundos.\n\n📱 *Grupo ID:* \`${grupoAtual}\``);
                } else {
                    await message.reply(`❌ *Erro no teste:* ${resultado.erro}`);
                }
                return;
            }

            if (comando === '.grupos_status') {
                let resposta = `📊 *STATUS DOS GRUPOS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                for (const [grupoId, config] of Object.entries(CONFIGURACAO_GRUPOS)) {
                    const dadosGrupo = dadosParaTasker.filter(d => d.grupo_id === grupoId);
                    const hoje = dadosGrupo.filter(d => {
                        const dataItem = new Date(d.timestamp).toDateString();
                        return dataItem === new Date().toDateString();
                    });
                    
                    resposta += `🏢 *${config.nome}*\n`;
                    resposta += `   📈 Total: ${dadosGrupo.length}\n`;
                    resposta += `   📅 Hoje: ${hoje.length}\n`;
                    resposta += `   📊 Sheets: ${dadosGrupo.filter(d => d.metodo === 'google_sheets').length}\n`;
                    resposta += `   📱 Backup: ${dadosGrupo.filter(d => d.metodo === 'whatsapp_backup').length}\n`;
                    resposta += `   🆔 ID: \`${grupoId}\`\n\n`;
                }
                
                await message.reply(resposta);
                return;
            }

            if (comando === '.sheets') {
                const dados = obterDadosTasker();
                const hoje = obterDadosTaskerHoje();
                const sheets = dados.filter(d => d.metodo === 'google_sheets').length;
                const whatsapp = dados.filter(d => d.metodo === 'whatsapp_backup').length;
                
                let resposta = `📊 *GOOGLE SHEETS STATUS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                resposta += `📈 Total enviado: ${dados.length}\n`;
                resposta += `📅 Hoje: ${hoje.length}\n`;
                resposta += `📊 Via Google Sheets: ${sheets}\n`;
                resposta += `📱 Via WhatsApp: ${whatsapp}\n`;
                resposta += `📱 Fila atual: ${filaMensagens.length}\n\n`;
                
                if (dados.length > 0) {
                    resposta += `📋 *Últimos 5 enviados:*\n`;
                    dados.slice(-5).forEach((item, index) => {
                        const metodo = item.metodo === 'google_sheets' ? '📊' : '📱';
                        resposta += `${index + 1}. ${metodo} ${item.dados} (${item.grupo})\n`;
                    });
                }
                
                await message.reply(resposta);
                return;
            }

            if (comando.startsWith('.clear_grupo ')) {
                const nomeGrupo = comando.replace('.clear_grupo ', '');
                const antes = dadosParaTasker.length;
                
                dadosParaTasker = dadosParaTasker.filter(d => !d.grupo.toLowerCase().includes(nomeGrupo.toLowerCase()));
                
                const removidos = antes - dadosParaTasker.length;
                await message.reply(`🗑️ *${removidos} registros do grupo "${nomeGrupo}" removidos!*`);
                return;
            }

            if (comando === '.clear_sheets') {
                dadosParaTasker = [];
                await message.reply('🗑️ *Dados do Google Sheets limpos!*');
                return;
            }

            if (comando.startsWith('.test_retry ')) {
                const params = comando.split(' ');
                if (params.length >= 3) {
                    const referencia = params[1];
                    const valor = params[2];
                    const numero = params[3] || '842223344';

                    console.log(`🧪 Testando sistema de retry: ${referencia} - ${valor}MT`);

                    const messageContext = {
                        grupoId: message.from,
                        numeroCliente: message.from
                    };

                    const resultado = await verificarPagamentoComRetry(referencia, valor, messageContext);

                    if (resultado === 'ja_processado') {
                        await message.reply(`✅ *Teste concluído!*\n\n📊 Resultado: Pagamento já processado\n💰 Referência: ${referencia}`);
                    } else if (resultado === true) {
                        await message.reply(`✅ *Teste concluído!*\n\n📊 Resultado: Pagamento encontrado\n💰 Referência: ${referencia}`);
                    } else {
                        await message.reply(`❌ *Teste concluído!*\n\n📊 Resultado: Pagamento não encontrado após retry\n💰 Referência: ${referencia}\n⏱️ Foram testados os delays de 30s, 45s e 60s`);
                    }
                } else {
                    await message.reply('❌ Formato: .test_retry REF123 150 842223344');
                }
                return;
            }

            // === COMANDOS SISTEMA DE PACOTES ===
            if (sistemaPacotes) {
                if (comando === '.pacotes') {
                    const lista = sistemaPacotes.listarClientesAtivos();
                    await message.reply(lista);
                    return;
                }

                if (comando === '.pacotes_stats') {
                    const stats = sistemaPacotes.obterEstatisticas();
                    await message.reply(stats);
                    return;
                }

                if (comando.startsWith('.validade ')) {
                    const numero = comando.split(' ')[1];
                    if (numero && /^\d{9}$/.test(numero)) {
                        const resultado = sistemaPacotes.verificarValidadePacote(numero);
                        await message.reply(resultado);
                    } else {
                        await message.reply('❌ Formato: .validade 842223344');
                    }
                    return;
                }

                if (comando.startsWith('.cancelar_pacote ')) {
                    const params = comando.split(' ');
                    if (params.length === 3) {
                        const numero = params[1];
                        const referencia = params[2];
                        const resultado = sistemaPacotes.cancelarPacote(numero, referencia);
                        await message.reply(resultado);
                    } else {
                        await message.reply('❌ Formato: .cancelar_pacote 842223344 REF123');
                    }
                    return;
                }

                if (comando.startsWith('.criar_pacote ')) {
                    const params = comando.split(' ');
                    if (params.length === 4) {
                        const referencia = params[1];
                        const numero = params[2];
                        const tipoPacote = params[3];

                        console.log(`📦 Criando pacote manual: ${referencia} para ${numero} (${tipoPacote} dias)`);
                        const resultado = await sistemaPacotes.processarComprovante(referencia, numero, message.from, tipoPacote);

                        if (resultado.sucesso) {
                            await message.reply(resultado.mensagem);
                        } else {
                            await message.reply(`❌ Erro ao criar pacote: ${resultado.erro}`);
                        }
                    } else {
                        await message.reply('❌ Formato: .criar_pacote REF123 842223344 30\n\nTipos disponíveis: 3, 5, 15, 30 dias');
                    }
                    return;
                }
            }

            // === NOVOS COMANDOS PARA DETECÇÃO DE GRUPOS ===
            if (comando === '.grupos') {
                try {
                    let resposta = `📋 *GRUPOS DETECTADOS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                    
                    const chats = await client.getChats();
                    const grupos = chats.filter(chat => chat.isGroup);
                    
                    resposta += `📊 Total de grupos: ${grupos.length}\n\n`;
                    
                    for (const grupo of grupos) {
                        const isMonitorado = CONFIGURACAO_GRUPOS.hasOwnProperty(grupo.id._serialized);
                        const status = isMonitorado ? '✅' : '❌';
                        
                        resposta += `${status} *${grupo.name}*\n`;
                        resposta += `   🆔 \`${grupo.id._serialized}\`\n`;
                        resposta += `   👥 ${grupo.participants.length} membros\n\n`;
                    }
                    
                    resposta += `\n🔧 *Para adicionar grupo:*\nCopie ID e adicione em CONFIGURACAO_GRUPOS`;
                    
                    await message.reply(resposta);
                    
                    console.log(`\n📋 COMANDO .grupos executado - ${grupos.length} grupos encontrados`);
                    grupos.forEach(grupo => {
                        const isMonitorado = CONFIGURACAO_GRUPOS.hasOwnProperty(grupo.id._serialized);
                        console.log(`${isMonitorado ? '✅' : '❌'} ${grupo.name}: ${grupo.id._serialized}`);
                    });
                    
                } catch (error) {
                    console.error('❌ Erro ao listar grupos:', error);
                    await message.reply('❌ Erro ao obter lista de grupos');
                }
                return;
            }

            if (comando === '.grupo_atual') {
                if (!message.from.endsWith('@g.us')) {
                    await message.reply('❌ Use este comando em um grupo!');
                    return;
                }
                
                await logGrupoInfo(message.from, 'COMANDO .grupo_atual');
                
                const configGrupo = getConfiguracaoGrupo(message.from);
                const status = configGrupo ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO';
                
                await message.reply(
                    `📋 *INFORMAÇÕES DESTE GRUPO*\n\n` +
                    `🆔 ID: \`${message.from}\`\n` +
                    `📊 Status: ${status}\n\n` +
                    `${configGrupo ? `🏢 Nome: ${configGrupo.nome}` : '🔧 Precisa ser configurado'}\n\n` +
                    `📝 Verifique o console para detalhes completos`
                );
                return;
            }
        }

        // === DETECÇÃO DE GRUPOS NÃO CONFIGURADOS ===
        if (message.from.endsWith('@g.us') && !isGrupoMonitorado(message.from) && !message.fromMe) {
            if (!gruposLogados.has(message.from)) {
                await logGrupoInfo(message.from, 'MENSAGEM RECEBIDA');
                gruposLogados.add(message.from);
                
                // Limpar cache a cada 50 grupos para evitar memory leak
                if (gruposLogados.size > 50) {
                    gruposLogados.clear();
                }
            }
        }

        // === PROCESSAMENTO DE GRUPOS ===
        if (!message.from.endsWith('@g.us') || !isGrupoMonitorado(message.from)) {
            return;
        }

        const configGrupo = getConfiguracaoGrupo(message.from);
        if (!configGrupo || message.fromMe) {
            return;
        }

        // === MODERAÇÃO ===
        if (message.type === 'chat') {
            const analise = contemConteudoSuspeito(message.body);
            
            if (analise.suspeito) {
                console.log(`🚨 Conteúdo suspeito detectado`);
                await aplicarModeracao(message, "Link detectado");
                return;
            }
        }

        // === PROCESSAMENTO DE IMAGENS ===
        if (message.type === 'image') {
            console.log(`📸 Imagem recebida`);
            
            try {
                const media = await message.downloadMedia();
                
                if (!media || !media.data) {
                    throw new Error('Falha ao baixar imagem');
                }
                
                const remetente = message.author || message.from;
                const legendaImagem = message.body || null;
                
                if (legendaImagem) {
                    console.log(`📝 Legenda da imagem detectada: ${legendaImagem.substring(0, 50)}...`);
                }
                
                const resultadoIA = await ia.processarMensagemBot(media.data, remetente, 'imagem', configGrupo, legendaImagem);
                
                if (resultadoIA.sucesso) {
                    
                    if (resultadoIA.tipo === 'comprovante_recebido') {
                        await message.reply(
                            `✅ *Comprovante processado!*\n\n` +
                            `💰 Referência: ${resultadoIA.referencia}\n` +
                            `📊 Megas: ${resultadoIA.megas}\n\n` +
                            `📱 *Envie UM número que vai receber ${resultadoIA.megas}!*`
                        );
                        return;
                        
                    } else if (resultadoIA.tipo === 'numero_processado') {
                        const dadosCompletos = resultadoIA.dadosCompletos;
                        const [referencia, megas, numero] = dadosCompletos.split('|');
                        const nomeContato = message._data.notifyName || 'N/A';
                        const autorMensagem = message.author || 'Desconhecido';
                        
                        // Usar valor do comprovante para verificação, não os megas
                        const valorPagamento = resultadoIA.valorComprovante || resultadoIA.valorPago || megas;
                        const numeroCliente = message.author || message.from;
                        const resultadoEnvio = await enviarParaTasker(referencia, valorPagamento, numero, message.from, autorMensagem, megas, numeroCliente);

                        if (resultadoEnvio && !resultadoEnvio.sucesso) {
                            if (resultadoEnvio.tipo === 'ja_processado') {
                                await message.reply(
                                    `⚠️ *PAGAMENTO JÁ PROCESSADO*\n\n` +
                                    `💰 Referência: ${referencia}\n` +
                                    `📊 Megas: ${megas}\n` +
                                    `📱 Número: ${numero}\n\n` +
                                    `✅ Este pagamento já foi processado anteriormente. Não é necessário enviar novamente.\n\n` +
                                    `Se você acredita que isso é um erro, entre em contato com o suporte.`
                                );
                                return;
                            } else if (resultadoEnvio.tipo === 'nao_encontrado') {
                                await message.reply(
                                    `⏳ *AGUARDANDO CONFIRMAÇÃO DO PAGAMENTO*\n\n` +
                                    `💰 Referência: ${referencia}\n` +
                                    `📊 Megas: ${megas}\n` +
                                    `📱 Número: ${numero}\n\n` +
                                    `🔍 Aguardando confirmação do pagamento no sistema...\n` +
                                    `⏱️ Tente novamente em alguns minutos.`
                                );
                                return;
                            }
                        }

                        await registrarComprador(message.from, numero, nomeContato, megas);

                        if (message.from === ENCAMINHAMENTO_CONFIG.grupoOrigem) {
                            const timestampMensagem = new Date().toLocaleString('pt-BR');
                            adicionarNaFila(dadosCompletos, autorMensagem, configGrupo.nome, timestampMensagem);
                        }

                        await message.reply(
                            `✅ *Pedido Recebido!*\n\n` +
                            `💰 Referência: ${referencia}\n` +
                            `📊 Megas: ${megas}\n` +
                            `📱 Número: ${numero}\n\n` +
                            `_⏳Processando... Aguarde enquanto o Sistema executa a transferência_`
                        );
                        return;
                    }
                } else {
                    await message.reply(
                        `❌ *Não consegui processar o comprovante da imagem!*\n\n` +
                        `📝 Envie o comprovante como texto.`
                    );
                }
                
            } catch (error) {
                console.error('❌ Erro ao processar imagem:', error);
                await message.reply(`❌ *Erro ao processar imagem!* Envie como texto.`);
            }
            
            return;
        }

        if (message.type !== 'chat') {
            return;
        }

        // Comandos de tabela e pagamento
        if (/tabela/i.test(message.body)) {
            await message.reply(configGrupo.tabela);
            return;
        }

        if (/pagamento/i.test(message.body)) {
            await message.reply(configGrupo.pagamento);
            return;
        }

        // === DETECÇÃO DE PERGUNTA POR NÚMERO (NÃO-ADMIN) ===
        if (!isAdmin && detectarPerguntaPorNumero(message.body)) {
            console.log(`📱 Pergunta por número detectada de não-admin`);
            await message.reply(
                `📱 *Para solicitar número ou suporte:*\n\n` +
                `💳 *Primeiro faça o pagamento:*\n\n` +
                `${configGrupo.pagamento}\n\n` +
                `📝 *Depois envie:*\n` +
                `• Comprovante de pagamento\n` +
                `• Número que vai receber os megas\n\n` +
                `🤖 *Sistema automático 24/7!*`
            );
            return;
        }

        // === PROCESSAMENTO COM IA (LÓGICA SIMPLES IGUAL AO BOT ATACADO) ===
        const remetente = message.author || message.from;
        const resultadoIA = await ia.processarMensagemBot(message.body, remetente, 'texto', configGrupo);
        
        if (resultadoIA.erro) {
            console.error(`❌ Erro na IA:`, resultadoIA.mensagem);
            return;
        }

        if (resultadoIA.sucesso) {
            
            if (resultadoIA.tipo === 'comprovante_recebido') {
                await message.reply(
                    `✅ *Comprovante processado!*\n\n` +
                    `💰 Referência: ${resultadoIA.referencia}\n` +
                    `📊 Megas: ${resultadoIA.megas}\n\n` +
                    `📱 *Envie UM número que vai receber ${resultadoIA.megas}!*`
                );
                return;
                
            } else if (resultadoIA.tipo === 'numero_processado') {
                const dadosCompletos = resultadoIA.dadosCompletos;
                const [referencia, megas, numero] = dadosCompletos.split('|');
                const nomeContato = message._data.notifyName || 'N/A';
                const autorMensagem = message.author || 'Desconhecido';
                
                // Usar valor do comprovante para verificação, não os megas
                const valorPagamento = resultadoIA.valorComprovante || resultadoIA.valorPago || megas;
                const numeroCliente = message.author || message.from;
                const resultadoEnvio = await enviarParaTasker(referencia, valorPagamento, numero, message.from, autorMensagem, megas, numeroCliente);

                if (resultadoEnvio && !resultadoEnvio.sucesso) {
                    if (resultadoEnvio.tipo === 'ja_processado') {
                        await message.reply(
                            `⚠️ *PAGAMENTO JÁ PROCESSADO*\n\n` +
                            `💰 Referência: ${referencia}\n` +
                            `📊 Megas: ${megas}\n` +
                            `📱 Número: ${numero}\n\n` +
                            `✅ Este pagamento já foi processado anteriormente. Não é necessário enviar novamente.\n\n` +
                            `Se você acredita que isso é um erro, entre em contato com o suporte.`
                        );
                        return;
                    } else if (resultadoEnvio.tipo === 'nao_encontrado') {
                        await message.reply(
                            `⏳ *AGUARDANDO CONFIRMAÇÃO DO PAGAMENTO*\n\n` +
                            `💰 Referência: ${referencia}\n` +
                            `📊 Megas: ${megas}\n` +
                            `📱 Número: ${numero}\n\n` +
                            `🔍 Aguardando confirmação do pagamento no sistema...\n` +
                            `⏱️ Tente novamente em alguns minutos.`
                        );
                        return;
                    }
                }

                await registrarComprador(message.from, numero, nomeContato, megas);

                if (message.from === ENCAMINHAMENTO_CONFIG.grupoOrigem) {
                    const timestampMensagem = new Date().toLocaleString('pt-BR');
                    adicionarNaFila(dadosCompletos, autorMensagem, configGrupo.nome, timestampMensagem);
                }

                await message.reply(
                    `✅ *Pedido Recebido!*\n\n` +
                    `💰 Referência: ${referencia}\n` +
                    `📊 Megas: ${megas}\n` +
                    `📱 Número: ${numero}\n\n` +
                    `_⏳Processando... Aguarde enquanto o Sistema executa a transferência_`
                );
                return;
            }
        }

        // === TRATAMENTO DE ERROS ===
        if (resultadoIA.tipo === 'numeros_sem_comprovante') {
            await message.reply(
                `📱 *Número detectado*\n\n` +
                `❌ Não encontrei seu comprovante.\n\n` +
                `📝 Envie primeiro o comprovante de pagamento.`
            );
            return;
        }

    } catch (error) {
        console.error('❌ Erro ao processar mensagem:', error);
    }
});

client.on('disconnected', (reason) => {
    console.log('❌ Bot desconectado:', reason);
});

// === INICIALIZAÇÃO ===
client.initialize();

// Salvar histórico a cada 5 minutos
setInterval(salvarHistorico, 5 * 60 * 1000);

// Limpar dados antigos do Tasker a cada hora
setInterval(() => {
    if (dadosParaTasker.length > 200) {
        dadosParaTasker = dadosParaTasker.slice(-100);
        console.log('🗑️ Dados antigos do Tasker removidos');
    }
}, 60 * 60 * 1000);

// Limpar cache de grupos logados a cada 2 horas
setInterval(() => {
    gruposLogados.clear();
    console.log('🗑️ Cache de grupos detectados limpo');
}, 2 * 60 * 60 * 1000);

process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada:', reason);
});

process.on('SIGINT', async () => {
    console.log('\n💾 Salvando antes de sair...');
    await salvarHistorico();
    
    // Salvar dados finais do Tasker
    if (dadosParaTasker.length > 0) {
        const dadosFinais = dadosParaTasker.map(d => d.dados).join('\n');
        await fs.writeFile('tasker_backup_final.txt', dadosFinais);
        console.log('💾 Backup final do Tasker salvo!');
    }
    
    console.log('🧠 IA: ATIVA');
    console.log('📊 Google Sheets: CONFIGURADO');
    console.log(`🔗 URL: ${GOOGLE_SHEETS_CONFIG.scriptUrl}`);
    console.log('🤖 Bot Retalho - Funcionamento igual ao Bot Atacado');
    console.log(ia.getStatus());
    process.exit(0);
});










