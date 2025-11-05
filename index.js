require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const axios = require('axios'); // npm install axios

// === GERENCIAMENTO VIA PM2 ===
// A limpeza de cache e reinicialização agora são feitas pelo PM2
// através do script restart-bots.js

// === SISTEMA DE NOTIFICAÇÕES DE REINICIALIZAÇÃO ===
const ARQUIVO_SINAL_RESTART = path.join(__dirname, '.restart_signal.json');

// Função para enviar notificação em todos os grupos
async function notificarGrupos(mensagem) {
    try {
        const chats = await client.getChats();
        const grupos = chats.filter(chat => chat.isGroup);

        console.log(`📢 Enviando notificação para ${grupos.length} grupos...`);

        for (const grupo of grupos) {
            try {
                await grupo.sendMessage(mensagem);
                console.log(`✅ Notificação enviada para: ${grupo.name}`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Delay entre mensagens
            } catch (error) {
                console.error(`❌ Erro ao notificar grupo ${grupo.name}:`, error.message);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao notificar grupos:', error.message);
    }
}

// Verificar se há sinal para notificar antes de desligar
async function verificarSinalRestart() {
    try {
        if (fssync.existsSync(ARQUIVO_SINAL_RESTART)) {
            const sinal = JSON.parse(await fs.readFile(ARQUIVO_SINAL_RESTART, 'utf-8'));

            if (sinal.tipo === 'pre-restart') {
                console.log('🔔 Sinal de pré-reinicialização detectado!');

                const horaAtual = new Date().toLocaleTimeString('pt-BR');
                await notificarGrupos(`⚠️ *AVISO DE MANUTENÇÃO*\n\n🔧 O bot será reiniciado para manutenção preventiva\n⏱️ Horário: ${horaAtual}\n🎯 Objetivo: Manter o sistema rápido e saudável\n⏳ Tempo estimado: 1-2 minutos\n\n_Aguarde alguns instantes..._`);

                // Aguardar 3 segundos para garantir que as mensagens foram enviadas
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Marcar como notificado e aguardando restart
                await fs.writeFile(ARQUIVO_SINAL_RESTART, JSON.stringify({
                    tipo: 'aguardando-restart',
                    horaNotificacao: new Date().toISOString()
                }));

                console.log('✅ Grupos notificados, aguardando PM2 reiniciar...');
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar sinal de restart:', error.message);
    }
}

// Verificar se acabou de reiniciar e notificar
async function verificarPosRestart() {
    try {
        if (fssync.existsSync(ARQUIVO_SINAL_RESTART)) {
            const sinal = JSON.parse(await fs.readFile(ARQUIVO_SINAL_RESTART, 'utf-8'));

            if (sinal.tipo === 'aguardando-restart') {
                console.log('✅ Bot reiniciado! Notificando grupos...');

                // Aguardar 5 segundos para garantir que o WhatsApp está conectado
                await new Promise(resolve => setTimeout(resolve, 5000));

                const horaAtual = new Date().toLocaleTimeString('pt-BR');
                await notificarGrupos(`✅ *BOT ONLINE*\n\n🎉 Manutenção concluída com sucesso!\n⏰ Horário: ${horaAtual}\n💚 Sistema otimizado e funcionando normalmente\n\n_Todos os serviços estão operacionais!_`);

                // Remover arquivo de sinal
                await fs.unlink(ARQUIVO_SINAL_RESTART);
                console.log('✅ Grupos notificados sobre reconexão!');
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar pós-restart:', error.message);
    }
}

// Verificar sinais periodicamente (a cada 10 segundos)
setInterval(verificarSinalRestart, 10000);

// === AXIOS SIMPLIFICADO (SEGUINDO PADRÃO BOT1) ===
const axiosInstance = axios.create({
    timeout: 60000, // 60 segundos - tolerância a conexões lentas
    maxRedirects: 3,
    headers: {
        'User-Agent': 'WhatsApp-Bot/1.0'
    }
});

// === FUNÇÃO DE RETRY COM BACKOFF EXPONENCIAL ===
async function axiosComRetry(config, maxTentativas = 3) {
    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
            const response = await axiosInstance(config);
            return response;
        } catch (error) {
            const ehTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');
            const ehUltimaTentativa = tentativa === maxTentativas;

            if (ehTimeout && !ehUltimaTentativa) {
                const delayMs = Math.min(1000 * Math.pow(2, tentativa - 1), 10000); // Max 10s
                console.log(`⏳ Timeout na tentativa ${tentativa}/${maxTentativas}, aguardando ${delayMs}ms antes de tentar novamente...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }

            throw error; // Se não é timeout ou é última tentativa, lança o erro
        }
    }
}

// === SISTEMA DE LOGS OTIMIZADO (MODO SILENCIOSO) ===
const SILENT_MODE = true; // Reduzir logs desnecessários para performance
const LOG_LEVEL = {
    ERROR: 0,   // Sempre mostrar erros
    WARN: 1,    // Mostrar avisos importantes
    INFO: 2,    // Mostrar informações essenciais
    DEBUG: 3    // Mostrar debug (desabilitado em modo silencioso)
};

function smartLog(level, message, ...args) {
    if (SILENT_MODE && level === LOG_LEVEL.DEBUG) return; // Pular logs debug
    if (level <= LOG_LEVEL.WARN || !SILENT_MODE) {
        console.log(message, ...args);
    }
}

// === CACHE ADMIN SIMPLIFICADO (SEGUINDO PADRÃO BOT1) ===
const adminCache = new Map();
const ADMIN_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

function getAdminFromCache(userId) {
    const entry = adminCache.get(userId);
    if (!entry || Date.now() - entry.timestamp > ADMIN_CACHE_TTL) {
        adminCache.delete(userId);
        return null;
    }
    return entry.isAdmin;
}

function setAdminCache(userId, isAdmin) {
    adminCache.set(userId, {
        isAdmin,
        timestamp: Date.now()
    });
}

// === IMPORTAR A IA ===
const WhatsAppAI = require('./whatsapp_ai');

// === IMPORTAR SISTEMA DE PACOTES ===
const SistemaPacotes = require('./sistema_pacotes');

// === IMPORTAR SISTEMA DE COMPRAS ===
const SistemaCompras = require('./sistema_compras');

// === IMPORTAR SISTEMA DE RELATÓRIOS ===
const SistemaRelatorios = require('./sistema_relatorios');

// === IMPORTAR SISTEMA DE BÔNUS ===
const SistemaBonus = require('./sistema_bonus');

// === CONFIGURAÇÃO GOOGLE SHEETS - BOT RETALHO (SCRIPT PRÓPRIO) ===
const GOOGLE_SHEETS_CONFIG = {
    scriptUrl: process.env.GOOGLE_SHEETS_SCRIPT_URL_RETALHO || 'https://script.google.com/macros/s/AKfycbyMilUC5bYKGXV95LR4MmyaRHzMf6WCmXeuztpN0tDpQ9_2qkgCxMipSVqYK_Q6twZG/exec',
    planilhaUrl: 'https://docs.google.com/spreadsheets/d/1vIv1Y0Hiu6NHEG37ubbFoa_vfbEe6sAb9I4JH-P38BQ/edit',
    planilhaId: '1vIv1Y0Hiu6NHEG37ubbFoa_vfbEe6sAb9I4JH-P38BQ',
    timeout: 30000,
    retryAttempts: 3,
    retryDelay: 2000
};

// === CONFIGURAÇÃO DE PAGAMENTOS (MESMA PLANILHA DO BOT ATACADO) ===
const PAGAMENTOS_CONFIG = {
    scriptUrl: 'https://script.google.com/macros/s/AKfycbzzifHGu1JXc2etzG3vqK5Jd3ihtULKezUTQQIDJNsr6tXx3CmVmKkOlsld0x1Feo0H/exec',
    timeout: 30000
};

console.log(`📊 Google Sheets configurado`);

// Função helper para reply com fallback
async function safeReply(message, client, texto) {
    try {
        await message.reply(texto);
    } catch (error) {
        console.log('⚠️ Erro no reply, usando sendMessage como fallback:', error.message);
        try {
            await client.sendMessage(message.from, texto);
        } catch (fallbackError) {
            console.error('❌ Erro também no sendMessage fallback:', fallbackError.message);
            throw fallbackError;
        }
    }
}

// Criar instância do cliente (SEGUINDO PADRÃO BOT1)
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "bot_retalho" // Simplificado como bot1
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-extensions',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection'
        ],
        timeout: 60000
    }
});

// === INICIALIZAR A IA ===
require('dotenv').config();
const ia = new WhatsAppAI(process.env.OPENAI_API_KEY);

// === SISTEMA DE PACOTES E BÔNUS (serão inicializados após WhatsApp conectar) ===
let sistemaPacotes = null;
let sistemaCompras = null;
let sistemaBonus = null;

// REMOVIDO: Sistema de encaminhamento de mensagens
// (Movido para outro bot)

// === SISTEMA DE FILA ASSÍNCRONA DE MENSAGENS ===
class MessageQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.concurrency = 3; // Processar até 3 mensagens simultaneamente
        this.activeJobs = 0;
        this.maxQueueSize = 1000; // Limite da fila para evitar overflow
    }

    async add(messageData, handler) {
        if (this.queue.length >= this.maxQueueSize) {
            console.log(`⚠️ QUEUE: Fila cheia (${this.maxQueueSize}), descartando mensagem mais antiga`);
            this.queue.shift();
        }

        this.queue.push({ messageData, handler, timestamp: Date.now() });
        this.processQueue();
    }

    async processQueue() {
        if (this.processing || this.activeJobs >= this.concurrency || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0 && this.activeJobs < this.concurrency) {
            const job = this.queue.shift();
            this.activeJobs++;

            // Processar job em paralelo sem await
            this.processJob(job).finally(() => {
                this.activeJobs--;
                this.processQueue(); // Continuar processando
            });
        }

        this.processing = false;
    }

    async processJob(job) {
        try {
            const { messageData, handler, timestamp } = job;
            const waitTime = Date.now() - timestamp;

            if (waitTime > 30000) { // Descartar mensagens muito antigas (30s)
                console.log(`⏰ QUEUE: Mensagem descartada por timeout (${waitTime}ms)`);
                return;
            }

            smartLog(LOG_LEVEL.DEBUG, `📤 QUEUE: Processando mensagem (fila: ${this.queue.length}, ativos: ${this.activeJobs})`);
            await handler(messageData);

        } catch (error) {
            console.error(`❌ QUEUE: Erro ao processar mensagem:`, error);
        }
    }

    getStats() {
        return {
            queueSize: this.queue.length,
            activeJobs: this.activeJobs,
            processing: this.processing
        };
    }
}

const messageQueue = new MessageQueue();

// REMOVIDO: Fila de mensagens (sistema movido para outro bot)

// === SISTEMA DE CACHE DE DADOS OTIMIZADO COM CLEANUP AUTOMÁTICO ===
// === CACHE DE TRANSAÇÕES SIMPLIFICADO (SEGUINDO PADRÃO BOT1) ===
let cacheTransacoes = new Map();

// === SISTEMA DE RETRY SILENCIOSO PARA PAGAMENTOS ===
let pagamentosPendentes = {}; // {id: {dados do pedido}}
let timerRetryPagamentos = null;
const ARQUIVO_PAGAMENTOS_PENDENTES = './pagamentos_pendentes.json';
const RETRY_INTERVAL = 60000; // 60 segundos
const RETRY_TIMEOUT = 30 * 60 * 1000; // 30 minutos
const MAX_RETRY_ATTEMPTS = 3; // Máximo 3 tentativas por pagamento

// === SISTEMA DE REFERÊNCIAS E BÔNUS ===
let codigosReferencia = {}; // codigo -> dados do dono
let referenciasClientes = {}; // cliente -> dados da referencia
let bonusSaldos = {}; // cliente -> saldo e historico
let pedidosSaque = {}; // referencia -> dados do pedido
let membrosEntrada = {}; // {grupoId: {memberId: dataEntrada}}

// Arquivos de persistência
const ARQUIVO_REFERENCIAS = './dados_referencias.json';
const ARQUIVO_BONUS = './dados_bonus.json';
const ARQUIVO_CODIGOS = './dados_codigos.json';
const ARQUIVO_SAQUES = './dados_saques.json';
const ARQUIVO_MEMBROS = './dados_membros_entrada.json';

// === FUNÇÕES DO SISTEMA DE REFERÊNCIA ===

let ultimosParticipantes = {}; // {grupoId: [participantIds]} - cache dos participantes

// === CACHE PARA RASTREAR MEMBROS JÁ PROCESSADOS VIA GROUP-JOIN ===
let membrosProcessadosViaEvent = new Set(); // Evita processamento duplicado

// Sistema automático de detecção de novos membros
async function iniciarMonitoramentoMembros() {
    console.log('⏸️ Monitoramento automático de novos membros está DESATIVADO');
    // Função desativada completamente - não faz nada
    return;
}

// Verificar novos membros em todos os grupos monitorados
async function verificarNovosMembros() {
    for (const grupoId of Object.keys(CONFIGURACAO_GRUPOS)) {
        try {
            await detectarNovosMembrosGrupo(grupoId);
        } catch (error) {
            // Silencioso para não poluir logs
        }
    }
}

// Detectar novos membros em um grupo específico
async function detectarNovosMembrosGrupo(grupoId) {
    try {
        const chat = await client.getChatById(grupoId);
        const participants = await chat.participants;
        const participantIds = participants.map(p => p.id._serialized);
        
        // Se é a primeira vez que verificamos este grupo
        if (!ultimosParticipantes[grupoId]) {
            ultimosParticipantes[grupoId] = participantIds;
            return;
        }
        
        // Encontrar novos participantes
        const novosParticipantes = participantIds.filter(id => 
            !ultimosParticipantes[grupoId].includes(id)
        );
        
        // Processar novos membros
        for (const participantId of novosParticipantes) {
            await processarNovoMembro(grupoId, participantId);
        }
        
        // Atualizar cache
        ultimosParticipantes[grupoId] = participantIds;
        
    } catch (error) {
        // Silencioso - grupo pode não existir ou bot não ter acesso
    }
}

// Processar novo membro detectado
async function processarNovoMembro(grupoId, participantId) {
    try {
        const configGrupo = getConfiguracaoGrupo(grupoId);
        if (!configGrupo) return;

        console.log(`👋 Novo membro detectado via POLLING: ${participantId}`);

        // Verificar se já foi processado via event 'group-join'
        const membroKey = `${grupoId}_${participantId}`;
        if (membrosProcessadosViaEvent.has(membroKey)) {
            console.log(`✅ Membro ${participantId} já foi processado via event 'group-join' - pulando...`);
            return;
        }

        // SISTEMA AUTOMÁTICO DESATIVADO - Usuário deve usar código manual
        console.log(`📢 Sistema automático desativado - novo membro deve usar código do convidador`);

        // Registrar entrada do membro
        await registrarEntradaMembro(grupoId, participantId);

    } catch (error) {
        console.error('❌ Erro ao processar novo membro:', error);
    }
}

// SISTEMA DE DETECÇÃO INTELIGENTE - CORRIGIDO
async function tentarDetectarConvidador(grupoId, novoMembroId) {
    try {
        console.log(`🔍 DETECÇÃO: Analisando quem adicionou ${novoMembroId}...`);

        const chat = await client.getChatById(grupoId);
        const participants = await chat.participants;

        // 1. ESTRATÉGIA: Filtrar participantes que estão na lista ADMINISTRADORES_GLOBAIS
        const admins = participants.filter(p => {
            // Verificar se o ID está diretamente na lista
            if (ADMINISTRADORES_GLOBAIS.includes(p.id._serialized)) return true;
            // Se for @lid, verificar se está mapeado
            if (p.id._serialized.includes('@lid') && MAPEAMENTO_IDS[p.id._serialized]) {
                return ADMINISTRADORES_GLOBAIS.includes(MAPEAMENTO_IDS[p.id._serialized]);
            }
            return false;
        }).filter(p => p.id._serialized !== novoMembroId);

        if (admins.length === 0) {
            console.log(`❌ DETECÇÃO: Nenhum admin da lista encontrado no grupo`);
            return null;
        }

        // 2. LÓGICA INTELIGENTE: Buscar o admin mais provável
        const hojeISO = new Date().toISOString().split('T')[0];

        // Verificar quantas referências cada admin criou hoje
        const adminStats = admins.map(admin => {
            const adminId = admin.id._serialized;
            const referenciasHoje = Object.keys(referenciasClientes).filter(clienteId => {
                const ref = referenciasClientes[clienteId];
                return ref.convidadoPor === adminId && ref.dataRegistro?.startsWith(hojeISO);
            }).length;

            return { adminId, referenciasHoje, nome: admin.pushname || 'Admin' };
        });

        // Ordenar por menos referências criadas (mais justo distribuir)
        adminStats.sort((a, b) => a.referenciasHoje - b.referenciasHoje);

        // 3. REGRAS DE SELEÇÃO INTELIGENTE:
        const adminEscolhido = adminStats[0];

        // Se o admin com menos referências tem muito poucas (0-2), é um bom candidato
        if (adminEscolhido.referenciasHoje <= 2) {
            console.log(`🎯 DETECÇÃO: Selecionado ${adminEscolhido.nome} (${adminEscolhido.referenciasHoje} refs hoje)`);
            return await criarReferenciaAutomaticaInteligente(adminEscolhido.adminId, novoMembroId, grupoId);
        }

        // Se todos os admins já têm muitas referências, usar distribuição rotativa
        console.log(`⚖️ DETECÇÃO: Usando distribuição rotativa entre admins`);
        return await criarReferenciaAutomaticaInteligente(adminEscolhido.adminId, novoMembroId, grupoId);

        /* CÓDIGO ANTIGO COMENTADO - CAUSAVA FALSAS REFERÊNCIAS
        const chat = await client.getChatById(grupoId);
        const participants = await chat.participants;
        const admins = participants.filter(p => p.isAdmin && p.id._serialized !== novoMembroId);

        if (admins.length > 0) {
            const possivelConvidador = admins[0].id._serialized;
            console.log(`🎯 BACKUP: Assumindo que ${possivelConvidador} adicionou ${novoMembroId}`);

            const hojeISO = new Date().toISOString().split('T')[0];
            const referenciasHoje = Object.keys(referenciasClientes).filter(clienteId => {
                const ref = referenciasClientes[clienteId];
                return ref.convidadoPor === possivelConvidador &&
                       ref.dataRegistro?.startsWith(hojeISO);
            }).length;

            if (referenciasHoje >= 5) {
                console.log(`⚠️ BACKUP: ${possivelConvidador} já tem ${referenciasHoje} referências hoje, pulando...`);
                return false;
            }

            const resultado = await criarReferenciaAutomaticaBackup(possivelConvidador, novoMembroId, grupoId);
            console.log(`🔗 BACKUP: Resultado da criação: ${resultado ? 'SUCESSO' : 'FALHOU'}`);

            return resultado;
        } else {
            console.log(`❌ BACKUP: Nenhum admin encontrado no grupo`);
            return false;
        }
        */

    } catch (error) {
        console.error('❌ Erro ao tentar detectar convidador (backup):', error);
        return null;
    }
}

// === DETECÇÃO DE CONVIDADOR VIA ANÁLISE DE MENSAGENS ===
async function detectarConvidadorViaMensagens(grupoId, novoMembroId) {
    try {
        console.log(`🔍 ANÁLISE: Detectando convidador via mensagens para ${novoMembroId}...`);

        // Obter histórico de mensagens recentes do grupo (últimos 10 minutos)
        const chat = await client.getChatById(grupoId);
        const agora = Date.now();
        const limiteTempo = agora - (10 * 60 * 1000); // 10 minutos atrás

        // Buscar mensagens recentes
        const mensagens = await chat.fetchMessages({ limit: 100 });
        console.log(`📜 Analisando ${mensagens.length} mensagens recentes...`);

        let convidadorDetectado = null;
        let confiabilidade = 0;

        // 1. PRIORIDADE MÁXIMA: Buscar mensagens de sistema do WhatsApp
        for (const mensagem of mensagens) {
            // Pular mensagens antigas
            if (mensagem.timestamp * 1000 < limiteTempo) {
                continue;
            }

            // Buscar mensagens de sistema (aqueles placeholders cinzentos)
            const isSistema = mensagem.type === 'notification' ||
                             mensagem.type === 'group_notification' ||
                             mensagem.type === 'GROUP_NOTIFICATION' ||
                             mensagem.type === 'NOTIFICATION';

            if (isSistema || (mensagem.body && (mensagem.body.includes('adicionou') || mensagem.body.includes('added')))) {
                console.log(`🔔 NOTIFICAÇÃO SISTEMA:`, {
                    type: mensagem.type,
                    body: mensagem.body,
                    author: mensagem.author,
                    timestamp: new Date(mensagem.timestamp * 1000).toLocaleString()
                });

                // Tentar extrair quem adicionou da mensagem do sistema
                if (mensagem.body) {
                    const nomeNovoMembro = await obterNomeContato(novoMembroId);

                    // Padrões mais abrangentes para detectar adição
                    const padroesAdicao = [
                        new RegExp(`([\\w\\s]+)\\s+(adicionou|added)\\s+.*${nomeNovoMembro.split(' ')[0]}`, 'i'),
                        new RegExp(`([\\w\\s]+)\\s+(adicionou|added)\\s+.*${nomeNovoMembro}`, 'i'),
                        new RegExp(`(.+)\\s+(adicionou|added)\\s+(.+)`, 'i') // Padrão genérico
                    ];

                    for (const regex of padroesAdicao) {
                        const match = mensagem.body.match(regex);
                        if (match) {
                            const nomeConvidador = match[1].trim();
                            console.log(`🎯 SISTEMA DETECTOU: "${nomeConvidador}" adicionou "${match[3] || nomeNovoMembro}"`);

                            // Buscar ID do convidador pelos participantes
                            const participants = chat.participants;
                            for (const participant of participants) {
                                const nomeParticipante = await obterNomeContato(participant.id._serialized);

                                // Comparação flexível de nomes
                                const nomeParticipanteLimpo = nomeParticipante.toLowerCase().trim();
                                const nomeConvidadorLimpo = nomeConvidador.toLowerCase().trim();

                                if ((nomeParticipanteLimpo.includes(nomeConvidadorLimpo) ||
                                     nomeConvidadorLimpo.includes(nomeParticipanteLimpo)) &&
                                    isAdministrador(participant.id._serialized)) {

                                    convidadorDetectado = participant.id._serialized;
                                    confiabilidade = 95; // Altíssima confiabilidade para mensagens do sistema
                                    console.log(`🎯 CONFIRMADO VIA SISTEMA: ${nomeParticipante} (${convidadorDetectado})`);
                                    break;
                                }
                            }

                            if (convidadorDetectado) break;
                        }
                    }
                }
            }

            if (convidadorDetectado) break;
        }

        // 2. SEGUNDO MÉTODO: Buscar padrões de convite nas mensagens de usuários
        if (!convidadorDetectado) {
            for (const mensagem of mensagens) {
                if (mensagem.timestamp * 1000 < limiteTempo) continue;

                const autorMensagem = mensagem.author || mensagem.from;
                const corpo = mensagem.body.toLowerCase();

                // Buscar padrões de convite nas mensagens
                const padroesFrases = [
                    /vou adicionar/i,
                    /vou convidar/i,
                    /vou chamar/i,
                    /adicionei/i,
                    /convidei/i,
                    /chamei/i,
                    /entrem?\s+no\s+grupo/i,
                    /venham?\s+para\s+o\s+grupo/i,
                    /grupo\s+novo/i
                ];

                for (const padrao of padroesFrases) {
                    if (padrao.test(corpo)) {
                        console.log(`💡 PADRÃO DETECTADO: "${corpo.substring(0, 50)}..." por ${autorMensagem}`);

                        const isAdmin = isAdministrador(autorMensagem);
                        if (isAdmin) {
                            convidadorDetectado = autorMensagem;
                            confiabilidade = 75; // Boa confiabilidade para padrões + admin
                            console.log(`🎯 DETECTADO VIA PADRÃO: ${autorMensagem} (confiabilidade: ${confiabilidade}%)`);
                            break;
                        }
                    }
                }

                if (convidadorDetectado) break;
            }
        }

        // 3. FALLBACK: Distribuição inteligente
        if (!convidadorDetectado) {
            console.log(`🧠 Usando distribuição inteligente como backup...`);
            convidadorDetectado = await selecionarAdminComMenosReferencias(grupoId);
            confiabilidade = 50; // Confiabilidade média para distribuição inteligente
        }

        if (convidadorDetectado) {
            console.log(`✅ DETECTADO: ${convidadorDetectado} (confiabilidade: ${confiabilidade}%)`);

            // Criar referência automática com método identificado
            const resultado = await criarReferenciaAutomaticaInteligente(
                convidadorDetectado,
                novoMembroId,
                grupoId
            );

            if (resultado) {
                // Adicionar indicador de método de detecção
                const referencia = referenciasClientes[novoMembroId];
                if (referencia) {
                    referencia.metodoDeteccao = 'AUTO_ANALISE_MENSAGENS';
                    referencia.confiabilidade = confiabilidade;

                    console.log(`🎯 ANÁLISE: Referência criada com ${confiabilidade}% de confiabilidade`);
                }
            }

            return resultado;
        } else {
            console.log(`❌ ANÁLISE: Não foi possível detectar convidador`);
            return false;
        }

    } catch (error) {
        console.error('❌ Erro na análise de mensagens:', error);
        return false;
    }
}

// === FUNÇÃO AUXILIAR PARA OBTER NOME DE CONTATO ===
async function obterNomeContato(contactId) {
    try {
        const contact = await client.getContactById(contactId);
        return contact.pushname || contact.name || contact.number || 'Desconhecido';
    } catch (error) {
        console.error(`❌ Erro ao obter nome do contato ${contactId}:`, error);
        return 'Desconhecido';
    }
}

// === SELEÇÃO INTELIGENTE DE ADMIN COM MENOS REFERÊNCIAS ===
async function selecionarAdminComMenosReferencias(grupoId) {
    try {
        const chat = await client.getChatById(grupoId);
        const participants = chat.participants;

        // Filtrar apenas admins da lista ADMINISTRADORES_GLOBAIS
        const admins = participants.filter(p => {
            if (ADMINISTRADORES_GLOBAIS.includes(p.id._serialized)) return true;
            if (p.id._serialized.includes('@lid') && MAPEAMENTO_IDS[p.id._serialized]) {
                return ADMINISTRADORES_GLOBAIS.includes(MAPEAMENTO_IDS[p.id._serialized]);
            }
            return false;
        });
        if (admins.length === 0) {
            console.log(`❌ Nenhum admin da lista encontrado no grupo`);
            return null;
        }

        console.log(`👥 DISTRIBUIÇÃO: Analisando ${admins.length} admins...`);

        // Contar referências criadas hoje por cada admin
        const hoje = new Date().toDateString();
        const contadorReferencias = {};

        // Inicializar contador para todos os admins
        admins.forEach(admin => {
            contadorReferencias[admin.id._serialized] = 0;
        });

        // Contar referências existentes
        Object.values(referenciasClientes).forEach(ref => {
            if (ref.dataReferencia && new Date(ref.dataReferencia).toDateString() === hoje) {
                if (contadorReferencias.hasOwnProperty(ref.convidadoPor)) {
                    contadorReferencias[ref.convidadoPor]++;
                }
            }
        });

        // Encontrar admin com menos referências
        let adminSelecionado = null;
        let menorContador = Infinity;

        for (const [adminId, contador] of Object.entries(contadorReferencias)) {
            console.log(`📊 Admin ${adminId}: ${contador} referências hoje`);
            if (contador < menorContador) {
                menorContador = contador;
                adminSelecionado = adminId;
            }
        }

        if (adminSelecionado) {
            console.log(`🎯 SELECIONADO: ${adminSelecionado} (${menorContador} referências hoje)`);
        }

        return adminSelecionado;

    } catch (error) {
        console.error('❌ Erro ao selecionar admin:', error);
        return null;
    }
}

// === CRIAÇÃO DE REFERÊNCIA AUTOMÁTICA INTELIGENTE ===
async function criarReferenciaAutomaticaInteligente(convidadorId, convidadoId, grupoId) {
    try {
        console.log(`🤖 INTELIGENTE: Criando referência automática: ${convidadorId} → ${convidadoId}`);

        // Verificar se o convidado já tem referência
        if (referenciasClientes[convidadoId]) {
            console.log(`   ⚠️ INTELIGENTE: Cliente ${convidadoId} já tem referência registrada`);
            return false;
        }

        // Obter nomes para logs mais claros
        let nomeConvidador = convidadorId;
        let nomeConvidado = convidadoId;

        try {
            const contactConvidador = await client.getContactById(convidadorId);
            const contactConvidado = await client.getContactById(convidadoId);
            nomeConvidador = contactConvidador.pushname || contactConvidador.name || convidadorId;
            nomeConvidado = contactConvidado.pushname || contactConvidado.name || convidadoId;
        } catch (error) {
            console.log(`   ⚠️ Não foi possível obter nomes dos contatos`);
        }

        // Gerar código único
        const codigo = gerarCodigoReferencia(convidadorId);

        // CORRIGIDO: Registrar código ANTES da referência do cliente (ESTRUTURA PADRONIZADA)
        codigosReferencia[codigo] = {
            dono: convidadorId, // CORRIGIDO: usar 'dono' em vez de salvar só o ID
            nome: nomeConvidador,
            criado: new Date().toISOString(),
            ativo: true,
            usado: true,
            usadoPor: convidadoId,
            dataUso: new Date().toISOString(),
            automatico: true,
            metodoDeteccao: 'AUTO_INTELIGENTE'
        };

        // Criar referência com indicação de detecção automática
        referenciasClientes[convidadoId] = {
            codigo: codigo,
            convidadoPor: convidadorId,
            nomeConvidador: nomeConvidador,
            nomeConvidado: nomeConvidado,
            dataRegistro: new Date().toISOString(),
            grupo: grupoId,
            comprasRealizadas: 0,
            bonusTotal: 0,
            metodoDeteccao: 'AUTO_INTELIGENTE', // Indicação especial
            obs: 'Referência criada por detecção automática inteligente'
        };

        console.log(`   ✅ INTELIGENTE: Referência criada: ${codigo} (${nomeConvidador} → ${nomeConvidado})`);

        // CORRIGIDO: Inicializar saldo de bônus do convidador
        if (!bonusSaldos[convidadorId]) {
            bonusSaldos[convidadorId] = {
                saldo: 0,
                detalhesReferencias: {},
                historicoSaques: [],
                totalReferencias: 0
            };
        }

        // Salvar dados
        agendarSalvamento();

        // Enviar notificação ao convidador com indicação de auto-detecção
        try {
            const mensagemNotificacao = `🤖 *REFERÊNCIA AUTOMÁTICA CRIADA*

🎯 **Código:** ${codigo}
👤 **Novo cliente:** ${nomeConvidado}
📅 **Data:** ${new Date().toLocaleDateString('pt-PT')}

⚠️ *Esta referência foi criada automaticamente*
Se não foi você quem convidou este membro, digite *.cancelar ${codigo}* para cancelar.

💰 Ganhe 200MB a cada compra deles (até 5 compras = 1GB)!`;

            await client.sendMessage(convidadorId, mensagemNotificacao);
            console.log(`   ✅ INTELIGENTE: Notificação enviada ao convidador`);
        } catch (error) {
            console.error(`   ❌ Erro ao enviar notificação:`, error);
        }

        return true;

    } catch (error) {
        console.error('❌ Erro ao criar referência automática inteligente:', error);
        return false;
    }
}

// Versão backup da criação de referência (com indicação de incerteza) - DEPRECATED
async function criarReferenciaAutomaticaBackup(convidadorId, convidadoId, grupoId) {
    try {
        console.log(`🔗 BACKUP: Criando referência automática: ${convidadorId} → ${convidadoId}`);

        // Verificar se o convidado já tem referência
        if (referenciasClientes[convidadoId]) {
            console.log(`   ⚠️ BACKUP: Cliente ${convidadoId} já tem referência registrada`);
            return false;
        }

        // Verificar se o convidador não está tentando convidar a si mesmo
        if (convidadorId === convidadoId) {
            console.log(`   ❌ BACKUP: Convidador tentou convidar a si mesmo`);
            return false;
        }

        // Gerar código único para esta referência
        const codigo = gerarCodigoReferencia(convidadorId);

        // Registrar código de referência (ESTRUTURA PADRONIZADA)
        codigosReferencia[codigo] = {
            dono: convidadorId, // CORRIGIDO: usar 'dono' em vez de 'criador'
            nome: 'AutoBackup', // Nome simplificado para referências backup
            criado: new Date().toISOString(),
            ativo: true,
            usado: true,
            usadoPor: convidadoId,
            dataUso: new Date().toISOString(),
            automatico: true,
            backup: true // Marcar como detectado por sistema backup
        };

        // Registrar referência do cliente
        referenciasClientes[convidadoId] = {
            codigo: codigo,
            convidadoPor: convidadorId,
            dataRegistro: new Date().toISOString(),
            comprasRealizadas: 0,
            automatico: true,
            backup: true // Marcar como detectado por sistema backup
        };

        // Inicializar saldo de bônus do convidador se não existir
        if (!bonusSaldos[convidadorId]) {
            bonusSaldos[convidadorId] = {
                saldo: 0,
                detalhesReferencias: {},
                historicoSaques: [],
                totalReferencias: 0
            };
        }

        // Incrementar total de referências
        bonusSaldos[convidadorId].totalReferencias++;

        // Inicializar detalhes da referência
        bonusSaldos[convidadorId].detalhesReferencias[convidadoId] = {
            compras: 0,
            bonusGanho: 0,
            codigo: codigo,
            ativo: true,
            automatico: true,
            backup: true
        };

        // CORRIGIDO: Salvar dados (reativar salvamento para persistir referências)
        agendarSalvamento();

        // Obter nomes dos participantes para notificação
        const nomeConvidador = await obterNomeContato(convidadorId);
        const nomeConvidado = await obterNomeContato(convidadoId);

        // Enviar notificação no grupo (com indicação de estimativa)
        try {
            // CORRIGIDO: Remover @lid e @c.us das menções
            const convidadorLimpo = convidadorId.replace('@c.us', '').replace('@lid', '');
            const convidadoLimpo = convidadoId.replace('@c.us', '').replace('@lid', '');

            await client.sendMessage(grupoId,
                `🎉 *NOVO MEMBRO ADICIONADO!*\n\n` +
                `👋 Bem-vindo @${convidadoLimpo}!\n\n` +
                `📢 Sistema detectou provável adição por: @${convidadorLimpo}\n` +
                `🎁 @${convidadorLimpo} ganhará *200MB* a cada compra de @${convidadoLimpo}!\n\n` +
                `📋 *Benefícios:*\n` +
                `• Máximo: 5 compras = 1000MB (1GB)\n` +
                `• Saque mínimo: 1000MB\n` +
                `• Sistema automático ativo!\n\n` +
                `💡 _Continue convidando amigos para ganhar mais bônus!_\n` +
                `⚠️ _Detecção automática por monitoramento do sistema_`, {
                mentions: [convidadorId, convidadoId]
            });

            console.log(`✅ BACKUP: Notificação de referência automática enviada`);
        } catch (error) {
            console.error('❌ BACKUP: Erro ao enviar notificação de referência:', error);
        }

        console.log(`✅ BACKUP: Referência automática criada: ${codigo} (${nomeConvidador} → ${nomeConvidado})`);

        return {
            codigo: codigo,
            convidador: convidadorId,
            convidado: convidadoId,
            automatico: true,
            backup: true
        };

    } catch (error) {
        console.error('❌ BACKUP: Erro ao criar referência automática:', error);
        return false;
    }
}

// Detectar novo membro pela primeira mensagem (backup)
async function detectarNovoMembro(grupoId, participantId, configGrupo) {
    // Esta função agora é só um backup caso o monitoramento automático falhe
    return;
}

// Registrar entrada de novo membro
async function registrarEntradaMembro(grupoId, participantId) {
    try {
        if (!membrosEntrada[grupoId]) {
            membrosEntrada[grupoId] = {};
        }
        
        membrosEntrada[grupoId][participantId] = new Date().toISOString();
        await salvarDadosMembros();
        
        console.log(`📝 Entrada registrada`);
    } catch (error) {
        console.error('❌ Erro ao registrar entrada de membro:', error);
    }
}

// Salvar dados de membros
async function salvarDadosMembros() {
    try {
        await fs.writeFile(ARQUIVO_MEMBROS, JSON.stringify(membrosEntrada));
    } catch (error) {
        console.error('❌ Erro ao salvar dados de membros:', error);
    }
}


// Verificar se usuário é elegível para usar código (últimos 5 dias)
function isElegivelParaCodigo(participantId, grupoId) {
    try {
        // CORRIGIDO: Se não tem registro, ASSUMIR que é novo membro (elegível)
        if (!membrosEntrada[grupoId] || !membrosEntrada[grupoId][participantId]) {
            console.log(`✅ Membro sem registro de entrada - ASSUMINDO NOVO MEMBRO (elegível)`);

            // Registrar automaticamente agora
            if (!membrosEntrada[grupoId]) {
                membrosEntrada[grupoId] = {};
            }
            membrosEntrada[grupoId][participantId] = new Date().toISOString();

            return true; // CORRIGIDO: Novo membro É elegível
        }

        const dataEntrada = new Date(membrosEntrada[grupoId][participantId]);
        const agora = new Date();
        const limite5Dias = 5 * 24 * 60 * 60 * 1000; // 5 dias em ms

        const tempoNoGrupo = agora - dataEntrada;
        const diasNoGrupo = Math.floor(tempoNoGrupo / (24 * 60 * 60 * 1000));
        const elegivelTempo = tempoNoGrupo <= limite5Dias;

        console.log(`🔍 Verificando elegibilidade - ${diasNoGrupo} dias no grupo - ${elegivelTempo ? 'ELEGÍVEL' : 'NÃO ELEGÍVEL'}`);

        return elegivelTempo;
    } catch (error) {
        console.error('❌ Erro ao verificar elegibilidade:', error);
        // CORRIGIDO: Em caso de erro, permitir (dar benefício da dúvida)
        return true;
    }
}

// Carregar dados persistentes
async function carregarDadosReferencia() {
    try {
        // Carregar códigos
        try {
            const dados = await fs.readFile(ARQUIVO_CODIGOS, 'utf8');
            codigosReferencia = JSON.parse(dados);
            console.log(`📋 ${Object.keys(codigosReferencia).length} códigos de referência carregados`);

            // LOGS DETALHADOS para debug
            if (Object.keys(codigosReferencia).length > 0) {
                console.log(`🔍 Códigos carregados:`);
                Object.entries(codigosReferencia).forEach(([codigo, dados]) => {
                    console.log(`   - ${codigo} → Dono: ${dados.dono} (${dados.nome})`);
                });
            }
        } catch (e) {
            console.log(`⚠️ Arquivo de códigos não encontrado, criando novo: ${e.message}`);
            codigosReferencia = {};
        }

        // Carregar referências  
        try {
            const dados = await fs.readFile(ARQUIVO_REFERENCIAS, 'utf8');
            referenciasClientes = JSON.parse(dados);
            console.log(`👥 ${Object.keys(referenciasClientes).length} referências de clientes carregadas`);
        } catch (e) {
            referenciasClientes = {};
        }

        // Carregar bônus
        try {
            const dados = await fs.readFile(ARQUIVO_BONUS, 'utf8');
            bonusSaldos = JSON.parse(dados);
            console.log(`💰 ${Object.keys(bonusSaldos).length} saldos de bônus carregados`);
        } catch (e) {
            bonusSaldos = {};
        }

        // Carregar saques
        try {
            const dados = await fs.readFile(ARQUIVO_SAQUES, 'utf8');
            pedidosSaque = JSON.parse(dados);
            console.log(`🏦 ${Object.keys(pedidosSaque).length} pedidos de saque carregados`);
        } catch (e) {
            pedidosSaque = {};
        }

        // Carregar dados de entrada de membros
        try {
            const dados = await fs.readFile(ARQUIVO_MEMBROS, 'utf8');
            membrosEntrada = JSON.parse(dados);
            console.log(`👥 ${Object.keys(membrosEntrada).length} grupos com dados de entrada carregados`);
        } catch (e) {
            membrosEntrada = {};
        }

    } catch (error) {
        console.error('❌ Erro ao carregar dados de referência:', error);
    }
}

// Salvar dados persistentes
// === SISTEMA DE SALVAMENTO OTIMIZADO ===
let salvamentoPendente = false;

async function salvarDadosReferencia() {
    // Evitar salvamentos simultâneos
    if (salvamentoPendente) {
        console.log(`⏳ Salvamento já em andamento, aguardando...`);
        return;
    }
    salvamentoPendente = true;

    console.log(`💾 Iniciando salvamento de dados de referência...`);
    console.log(`   - Códigos: ${Object.keys(codigosReferencia).length} registros`);
    console.log(`   - Referências: ${Object.keys(referenciasClientes).length} registros`);
    console.log(`   - Bônus: ${Object.keys(bonusSaldos).length} registros`);
    console.log(`   - Saques: ${Object.keys(pedidosSaque).length} registros`);

    try {
        // Usar Promise.allSettled para não falhar se um arquivo der erro
        const resultados = await Promise.allSettled([
            fs.writeFile(ARQUIVO_CODIGOS, JSON.stringify(codigosReferencia)),
            fs.writeFile(ARQUIVO_REFERENCIAS, JSON.stringify(referenciasClientes)),
            fs.writeFile(ARQUIVO_BONUS, JSON.stringify(bonusSaldos)),
            fs.writeFile(ARQUIVO_SAQUES, JSON.stringify(pedidosSaque))
        ]);

        // Log detalhado de cada salvamento
        const nomeArquivos = ['ARQUIVO_CODIGOS', 'ARQUIVO_REFERENCIAS', 'ARQUIVO_BONUS', 'ARQUIVO_SAQUES'];
        resultados.forEach((resultado, index) => {
            if (resultado.status === 'fulfilled') {
                console.log(`   ✅ ${nomeArquivos[index]} salvo com sucesso`);
            } else {
                console.error(`   ❌ ${nomeArquivos[index]} FALHOU:`, resultado.reason);
            }
        });

        const falhas = resultados.filter(r => r.status === 'rejected');
        if (falhas.length > 0) {
            console.error(`❌ Total de falhas: ${falhas.length}/${resultados.length}`);
        } else {
            console.log(`✅ Todos os arquivos salvos com sucesso!`);
        }
    } catch (error) {
        console.error('❌ Erro crítico ao salvar dados de referência:', error);
    } finally {
        salvamentoPendente = false;
    }
}

// Função para agendar salvamento com debounce
let timeoutSalvamento = null;

function agendarSalvamento() {
    if (timeoutSalvamento) {
        clearTimeout(timeoutSalvamento);
    }

    timeoutSalvamento = setTimeout(async () => {
        await salvarDadosReferencia();
        timeoutSalvamento = null;
    }, 3000); // 3 segundos de debounce
}

// Função para buscar saldo de bônus em todos os formatos possíveis
async function buscarSaldoBonus(userId) {
    // Usar sistemaBonus se disponível
    if (sistemaBonus) {
        return sistemaBonus.buscarSaldo(userId);
    }

    // Fallback para método antigo (caso sistemaBonus não esteja inicializado)
    console.log(`\n🔍 === BUSCA DE SALDO DETALHADA ===`);
    console.log(`📱 Buscando saldo para userId: "${userId}"`);

    // Tentar formato exato primeiro
    if (bonusSaldos[userId]) {
        console.log(`✅ Encontrado no formato exato: ${userId} (${bonusSaldos[userId].saldo}MB)`);
        return bonusSaldos[userId];
    }
    console.log(`❌ Não encontrado no formato exato: ${userId}`);

    // Extrair número base (sem sufixos)
    const numeroBase = userId.replace('@c.us', '').replace('@lid', '');
    console.log(`🔢 Número base extraído: "${numeroBase}"`);

    // Tentar todos os formatos possíveis
    const formatosPossiveis = [
        numeroBase,
        `${numeroBase}@c.us`,
        `${numeroBase}@lid`
    ];

    console.log(`🔍 Testando ${formatosPossiveis.length} formatos possíveis:`);
    for (const formato of formatosPossiveis) {
        console.log(`   - Testando: "${formato}"`);
        if (bonusSaldos[formato]) {
            console.log(`   ✅ ENCONTRADO! Formato: ${formato}, Saldo: ${bonusSaldos[formato].saldo}MB`);
            return bonusSaldos[formato];
        } else {
            console.log(`   ❌ Não encontrado`);
        }
    }

    // BUSCA AVANÇADA: Tentar obter número real do contato
    console.log(`🔍 Tentando busca avançada via número real do contato...`);
    try {
        const contact = await client.getContactById(userId);
        if (contact && contact.number) {
            console.log(`📞 Número real encontrado: ${contact.number}`);
            const numeroReal = contact.number;

            // Tentar com o número real
            const formatosReais = [
                numeroReal,
                `${numeroReal}@c.us`,
                `${numeroReal}@lid`
            ];

            for (const formato of formatosReais) {
                if (bonusSaldos[formato]) {
                    console.log(`   ✅ ENCONTRADO via número real! Formato: ${formato}, Saldo: ${bonusSaldos[formato].saldo}MB`);
                    return bonusSaldos[formato];
                }
            }
        }
    } catch (error) {
        console.log(`⚠️ Erro ao buscar contato: ${error.message}`);
    }

    console.log(`❌ Saldo não encontrado em nenhum formato`);
    console.log(`📋 Saldos existentes no sistema (primeiros 10):`);
    const chaves = Object.keys(bonusSaldos).slice(0, 10);
    chaves.forEach(chave => {
        console.log(`   • ${chave}: ${bonusSaldos[chave].saldo}MB`);
    });

    return null;
}

// Função para atualizar saldo em todos os formatos existentes
async function atualizarSaldoBonus(userId, operacao) {
    // Usar sistemaBonus se disponível
    if (sistemaBonus) {
        await sistemaBonus.atualizarSaldo(userId, operacao);
        return;
    }

    // Fallback para método antigo
    const numeroBase = userId.replace('@c.us', '').replace('@lid', '');
    const formatosPossiveis = [
        numeroBase,
        `${numeroBase}@c.us`,
        `${numeroBase}@lid`
    ];

    let atualizado = 0;
    for (const formato of formatosPossiveis) {
        if (bonusSaldos[formato]) {
            operacao(bonusSaldos[formato]);
            atualizado++;
        }
    }

    // Se não encontrou em nenhum formato padrão, fazer busca avançada
    if (atualizado === 0) {
        console.log(`🔍 Formato ${userId} não encontrado, tentando busca avançada...`);
        try {
            const contact = await client.getContactById(userId);
            if (contact && contact.number) {
                const numeroReal = contact.number;
                const formatosReais = [
                    numeroReal,
                    `${numeroReal}@c.us`,
                    `${numeroReal}@lid`
                ];

                for (const formato of formatosReais) {
                    if (bonusSaldos[formato]) {
                        console.log(`   ✅ ENCONTRADO via número real! Formato: ${formato}`);
                        operacao(bonusSaldos[formato]);
                        atualizado++;
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Erro na busca avançada para atualização:`, error.message);
        }
    }

    console.log(`💾 Saldo atualizado em ${atualizado} formato(s)`);
    return atualizado > 0;
}

// === CACHE DE TRANSAÇÕES (SEM ARQUIVOS .TXT) ===
function adicionarTransacaoCache(dados, grupoId) {
    const key = `${grupoId}_${Date.now()}_${Math.random()}`;
    cacheTransacoes.set(key, {
        ...dados,
        timestamp: Date.now(),
        grupo_id: grupoId
    });

    // Limpar cache automaticamente (manter últimas 100 transações)
    if (cacheTransacoes.size > 100) {
        const keys = Array.from(cacheTransacoes.keys());
        const oldKeys = keys.slice(0, keys.length - 100);
        oldKeys.forEach(key => cacheTransacoes.delete(key));
    }
}

// Gerar código único
function gerarCodigoReferencia(remetente) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let codigo;
    do {
        codigo = '';
        for (let i = 0; i < 6; i++) {
            codigo += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (codigosReferencia[codigo]);
    
    return codigo;
}

// Processar bônus de compra
async function processarBonusCompra(remetenteCompra, valorCompra) {
    console.log(`🎁 Verificando bônus para compra`);
    
    // Verificar se cliente tem referência
    const referencia = referenciasClientes[remetenteCompra];
    if (!referencia) {
        console.log(`   ❌ Cliente não tem referência registrada`);
        return false;
    }

    // Verificar se ainda pode ganhar bônus (máximo 5 compras)
    if (referencia.comprasRealizadas >= 5) {
        console.log(`   ⚠️ Cliente já fez 5 compras, sem mais bônus`);
        return false;
    }

    // Atualizar contador de compras
    referencia.comprasRealizadas++;
    
    // Creditar bônus ao convidador
    const convidador = referencia.convidadoPor;
    if (!bonusSaldos[convidador]) {
        bonusSaldos[convidador] = {
            saldo: 0,
            detalhesReferencias: {},
            historicoSaques: [],
            totalReferencias: 0
        };
    }

    // Adicionar 200MB ao saldo
    const bonusAtual = 200;
    bonusSaldos[convidador].saldo += bonusAtual;
    
    // Atualizar detalhes da referência
    if (!bonusSaldos[convidador].detalhesReferencias[remetenteCompra]) {
        bonusSaldos[convidador].detalhesReferencias[remetenteCompra] = {
            compras: 0,
            bonusGanho: 0,
            codigo: referencia.codigo,
            ativo: true
        };
    }
    
    bonusSaldos[convidador].detalhesReferencias[remetenteCompra].compras = referencia.comprasRealizadas;
    bonusSaldos[convidador].detalhesReferencias[remetenteCompra].bonusGanho += bonusAtual;
    
    // Enviar notificação de bônus por referência
    try {
        const nomeComprador = await obterNomeContato(remetenteCompra);
        const nomeConvidador = await obterNomeContato(convidador);
        const novoSaldo = bonusSaldos[convidador].saldo;
        const novoSaldoFormatado = novoSaldo >= 1024 ? `${(novoSaldo/1024).toFixed(2)}GB` : `${novoSaldo}MB`;

        // Verificar se é referência automática ou manual
        const isAutomatico = referencia.automatico;
        const tipoReferencia = isAutomatico ? 'adicionou ao grupo' : `usou seu código ${referencia.codigo}`;

        // CORRIGIDO: Remover @lid e @c.us das menções
        const convidadorLimpo = convidador.replace('@c.us', '').replace('@lid', '');
        const remetenteCompraLimpo = remetenteCompra.replace('@c.us', '').replace('@lid', '');

        await client.sendMessage(message.from,
            `🎉 *BÔNUS DE REFERÊNCIA CREDITADO!*\n\n` +
            `💎 @${convidadorLimpo}, recebeste *${bonusAtual}MB* de bônus!\n\n` +
            `👤 *Referenciado:* @${remetenteCompraLimpo}\n` +
            `📢 *Motivo:* @${remetenteCompraLimpo} que você ${tipoReferencia} fez uma compra!\n` +
            `🛒 *Compra:* ${referencia.comprasRealizadas}ª de 5\n` +
            `💰 *Novo saldo:* ${novoSaldoFormatado}\n\n` +
            `${novoSaldo >= 1024 ? '🚀 *Já podes sacar!* Use: *.sacar*' : '⏳ *Continua a convidar amigos para ganhar mais bônus!*'}`, {
            mentions: [convidador, remetenteCompra]
        });
    } catch (error) {
        console.error('❌ Erro ao enviar notificação de bônus:', error);
    }

    // Salvar dados
    agendarSalvamento();
    
    console.log(`   ✅ Bônus creditado: ${bonusAtual}MB (${referencia.comprasRealizadas}/5)`);
    
    return {
        convidador: convidador,
        bonusGanho: bonusAtual,
        compraAtual: referencia.comprasRealizadas,
        totalCompras: 5,
        novoSaldo: bonusSaldos[convidador].saldo
    };
}

// === CRIAR REFERÊNCIA AUTOMÁTICA ===
async function criarReferenciaAutomatica(convidadorId, convidadoId, grupoId) {
    try {
        console.log(`🤝 Criando referência automática: ${convidadorId} → ${convidadoId}`);

        // Verificar se o convidado já tem referência
        if (referenciasClientes[convidadoId]) {
            console.log(`   ⚠️ Cliente ${convidadoId} já tem referência registrada`);
            return false;
        }

        // Verificar se o convidador não está tentando convidar a si mesmo
        if (convidadorId === convidadoId) {
            console.log(`   ❌ Convidador tentou convidar a si mesmo`);
            return false;
        }

        // Gerar código único para esta referência (para compatibilidade com sistema antigo)
        const codigo = gerarCodigoReferencia(convidadorId);

        // Registrar código de referência (ESTRUTURA PADRONIZADA)
        codigosReferencia[codigo] = {
            dono: convidadorId, // CORRIGIDO: usar 'dono' em vez de 'criador'
            nome: 'Auto', // Nome simplificado para referências automáticas
            criado: new Date().toISOString(),
            ativo: true,
            usado: true,
            usadoPor: convidadoId,
            dataUso: new Date().toISOString(),
            automatico: true // Marcar como referência automática
        };

        // Registrar referência do cliente
        referenciasClientes[convidadoId] = {
            codigo: codigo,
            convidadoPor: convidadorId,
            dataRegistro: new Date().toISOString(),
            comprasRealizadas: 0,
            automatico: true // Marcar como referência automática
        };

        // Inicializar saldo de bônus do convidador se não existir
        if (!bonusSaldos[convidadorId]) {
            bonusSaldos[convidadorId] = {
                saldo: 0,
                detalhesReferencias: {},
                historicoSaques: [],
                totalReferencias: 0
            };
        }

        // Incrementar total de referências
        bonusSaldos[convidadorId].totalReferencias++;

        // Inicializar detalhes da referência
        bonusSaldos[convidadorId].detalhesReferencias[convidadoId] = {
            compras: 0,
            bonusGanho: 0,
            codigo: codigo,
            ativo: true,
            automatico: true
        };

        // CORRIGIDO: Salvar dados (reativar salvamento para persistir referências)
        agendarSalvamento();

        // Obter nomes dos participantes para notificação
        const nomeConvidador = await obterNomeContato(convidadorId);
        const nomeConvidado = await obterNomeContato(convidadoId);

        // Enviar notificação no grupo
        try {
            // CORRIGIDO: Remover @lid e @c.us das menções
            const convidadorLimpo = convidadorId.replace('@c.us', '').replace('@lid', '');
            const convidadoLimpo = convidadoId.replace('@c.us', '').replace('@lid', '');

            await client.sendMessage(grupoId,
                `🎉 *NOVO MEMBRO ADICIONADO!*\n\n` +
                `👋 Bem-vindo @${convidadoLimpo}!\n\n` +
                `📢 Adicionado por: @${convidadorLimpo}\n` +
                `🎁 @${convidadorLimpo} ganhará *200MB* a cada compra de @${convidadoLimpo}!\n\n` +
                `📋 *Benefícios:*\n` +
                `• Máximo: 5 compras = 1000MB (1GB)\n` +
                `• Saque mínimo: 1000MB\n` +
                `• Sistema automático ativo!\n\n` +
                `💡 _Continue convidando amigos para ganhar mais bônus!_`, {
                mentions: [convidadorId, convidadoId]
            });

            console.log(`✅ Notificação de referência automática enviada`);
        } catch (error) {
            console.error('❌ Erro ao enviar notificação de referência:', error);
        }

        console.log(`✅ Referência automática criada: ${codigo} (${nomeConvidador} → ${nomeConvidado})`);

        return {
            codigo: codigo,
            convidador: convidadorId,
            convidado: convidadoId,
            automatico: true
        };

    } catch (error) {
        console.error('❌ Erro ao criar referência automática:', error);
        return false;
    }
}

// === OBTER NOME DO CONTATO ===
async function obterNomeContato(contactId) {
    try {
        const contact = await client.getContactById(contactId);
        return contact.name || contact.pushname || contactId.replace('@c.us', '');
    } catch (error) {
        console.error(`❌ Erro ao obter nome do contato ${contactId}:`, error);
        return contactId.replace('@c.us', '');
    }
}

// === FUNÇÃO PARA NORMALIZAR VALORES ===
function normalizarValor(valor) {
    if (typeof valor === 'number') return valor;
    if (typeof valor === 'string') {
        // Remover caracteres não numéricos exceto ponto e vírgula
        let valorLimpo = valor.replace(/[^\d.,]/g, '');

        // Converter vírgula para ponto se for separador decimal
        if (valorLimpo.includes(',') && !valorLimpo.includes('.')) {
            const partes = valorLimpo.split(',');
            if (partes.length === 2 && partes[1].length <= 2) {
                valorLimpo = partes[0] + '.' + partes[1];
            } else {
                valorLimpo = valorLimpo.replace(/,/g, '');
            }
        } else if (valorLimpo.includes(',')) {
            // Se tem tanto vírgula quanto ponto, remover vírgulas (separadores de milhares)
            valorLimpo = valorLimpo.replace(/,/g, '');
        }

        const numeroFinal = parseFloat(valorLimpo) || 0;
        console.log(`🔧 normalizarValor: "${valor}" → "${valorLimpo}" → ${numeroFinal}`);
        return numeroFinal;
    }
    return 0;
}

// === FUNÇÃO PARA CALCULAR VALOR DO PEDIDO ===
function calcularValorPedido(megas, precosGrupo) {
    const megasNum = parseInt(megas) || 0;
    if (precosGrupo && precosGrupo[megasNum]) {
        return precosGrupo[megasNum];
    }
    // Fallback: calcular valor baseado em preço por MB (assumindo ~12.5MT/GB)
    const valorPorMB = 12.5 / 1024; // ~0.012MT por MB
    return Math.round(megasNum * valorPorMB);
}

// === FUNÇÃO PARA VERIFICAR PAGAMENTO (SÓ BUSCA, NÃO MARCA) ===
async function verificarPagamentoIndividual(referencia, valorEsperado) {
    try {
        const valorNormalizado = normalizarValor(valorEsperado);

        console.log(`🔍 REVENDEDORES: Verificando pagamento ${referencia} - ${valorNormalizado}MT (original: ${valorEsperado})`);

        // Primeira tentativa: busca pelo valor exato (COM RETRY AUTOMÁTICO)
        let response = await axiosComRetry({
            method: 'post',
            url: PAGAMENTOS_CONFIG.scriptUrl,
            data: {
                action: "buscar_por_referencia",
                referencia: referencia,
                valor: valorNormalizado
            },
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            timeout: 60000 // 60 segundos
        }, 3); // 3 tentativas

        if (response.data && response.data.encontrado) {
            // Verificar se já foi processado
            if (response.data.ja_processado) {
                console.log(`⚠️ REVENDEDORES: Pagamento ${referencia} já foi processado anteriormente!`);
                return 'JA_PROCESSADO'; // Retornar status especial
            }

            console.log(`✅ REVENDEDORES: Pagamento encontrado e PENDENTE (valor exato)!`);
            return true;
        }

        console.log(`❌ REVENDEDORES: Pagamento não encontrado`);
        return false;

    } catch (error) {
        const ehTimeout = error.code === 'ECONNABORTED' || error.message.includes('timeout');
        if (ehTimeout) {
            console.error(`⏰ REVENDEDORES: Timeout ao verificar pagamento ${referencia} - planilha demorou muito para responder`);
            console.error(`💡 Sugestão: O pagamento será verificado automaticamente no próximo ciclo de retry`);
        } else {
            console.error(`❌ REVENDEDORES: Erro ao verificar pagamento:`, error.message);
        }
        return false;
    }
}

// === FUNÇÃO PARA MARCAR PAGAMENTO COMO PROCESSADO ===
async function marcarPagamentoComoProcessado(referencia, valor) {
    try {
        const valorNormalizado = normalizarValor(valor);

        console.log(`✅ REVENDEDORES: Marcando pagamento ${referencia} como PROCESSADO`);

        const response = await axiosComRetry({
            method: 'post',
            url: PAGAMENTOS_CONFIG.scriptUrl,
            data: {
                action: "marcar_processado",
                referencia: referencia,
                valor: valorNormalizado
            },
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            },
            timeout: 60000 // 60 segundos
        }, 3); // 3 tentativas

        if (response.data && response.data.success) {
            console.log(`✅ REVENDEDORES: Pagamento ${referencia} marcado como PROCESSADO com sucesso!`);
            return true;
        } else {
            console.log(`⚠️ REVENDEDORES: Não foi possível marcar pagamento como processado: ${response.data?.message || 'Erro desconhecido'}`);
            return false;
        }

    } catch (error) {
        console.error(`❌ REVENDEDORES: Erro ao marcar pagamento como processado:`, error.message);
        return false;
    }
}

// Base de dados de compradores
let historicoCompradores = {};
const ARQUIVO_HISTORICO = 'historico_compradores.json';

// Cache de administradores REMOVIDO - usa apenas ADMINISTRADORES_GLOBAIS

// === FUNÇÕES DO SISTEMA DE RETRY SILENCIOSO ===

// Carregar pagamentos pendentes do arquivo
async function carregarPagamentosPendentes() {
    try {
        const dados = await fs.readFile(ARQUIVO_PAGAMENTOS_PENDENTES, 'utf8');
        pagamentosPendentes = JSON.parse(dados);
        console.log(`💾 RETRY: ${Object.keys(pagamentosPendentes).length} pagamentos pendentes carregados`);
    } catch (error) {
        console.log(`💾 RETRY: Nenhum arquivo de pendências encontrado - iniciando limpo`);
        pagamentosPendentes = {};
    }
}

// Salvar pagamentos pendentes no arquivo
async function salvarPagamentosPendentes() {
    try {
        await fs.writeFile(ARQUIVO_PAGAMENTOS_PENDENTES, JSON.stringify(pagamentosPendentes, null, 2));
        console.log(`💾 RETRY: Pagamentos pendentes salvos - ${Object.keys(pagamentosPendentes).length} pendências`);
    } catch (error) {
        console.error(`❌ RETRY: Erro ao salvar pendências:`, error);
    }
}

// Adicionar pagamento para retry
async function adicionarPagamentoPendente(referencia, valorComprovante, dadosCompletos, message, resultadoIA) {
    const id = `${referencia}_${Date.now()}`;
    const agora = Date.now();

    const pendencia = {
        id: id,
        referencia: referencia,
        valorComprovante: valorComprovante,
        dadosCompletos: dadosCompletos,
        timestamp: agora,
        expira: agora + RETRY_TIMEOUT,
        tentativas: 0,
        // Dados para resposta
        chatId: message.from,
        messageData: {
            author: message.author || message.from,
            notifyName: message._data?.notifyName || 'N/A'
        },
        resultadoIA: resultadoIA
    };

    pagamentosPendentes[id] = pendencia;
    await salvarPagamentosPendentes();

    console.log(`⏳ RETRY: Pagamento ${referencia} adicionado à fila de retry`);

    // Iniciar timer se não existe
    if (!timerRetryPagamentos) {
        iniciarTimerRetryPagamentos();
    }

    return id;
}

// Remover pagamento pendente
async function removerPagamentoPendente(id) {
    if (pagamentosPendentes[id]) {
        delete pagamentosPendentes[id];
        await salvarPagamentosPendentes();
        console.log(`✅ RETRY: Pagamento ${id} removido da fila`);
    }
}

// Iniciar timer de verificação periódica
function iniciarTimerRetryPagamentos() {
    if (timerRetryPagamentos) {
        clearInterval(timerRetryPagamentos);
    }

    console.log(`🔄 RETRY: Iniciando verificação a cada ${RETRY_INTERVAL/1000}s`);

    timerRetryPagamentos = setInterval(async () => {
        await verificarPagamentosPendentes();
    }, RETRY_INTERVAL);
}

// Parar timer de verificação
function pararTimerRetryPagamentos() {
    if (timerRetryPagamentos) {
        clearInterval(timerRetryPagamentos);
        timerRetryPagamentos = null;
        console.log(`⏹️ RETRY: Timer de verificação parado`);
    }
}

// Verificar todos os pagamentos pendentes
async function verificarPagamentosPendentes() {
    const agora = Date.now();
    const pendencias = Object.values(pagamentosPendentes);

    if (pendencias.length === 0) {
        pararTimerRetryPagamentos();
        return;
    }

    console.log(`🔍 RETRY: Verificando ${pendencias.length} pagamentos pendentes...`);

    for (const pendencia of pendencias) {
        // Verificar se expirou
        if (agora > pendencia.expira) {
            console.log(`⏰ RETRY: Pagamento ${pendencia.referencia} expirou após 30min`);
            await removerPagamentoPendente(pendencia.id);
            continue;
        }

        // Verificar se atingiu limite de tentativas
        if (pendencia.tentativas >= MAX_RETRY_ATTEMPTS) {
            console.log(`❌ RETRY: Pagamento ${pendencia.referencia} atingiu limite de ${MAX_RETRY_ATTEMPTS} tentativas - removendo da fila`);
            await removerPagamentoPendente(pendencia.id);
            continue;
        }

        // Verificar pagamento
        pendencia.tentativas++;
        console.log(`🔍 RETRY: Tentativa ${pendencia.tentativas}/${MAX_RETRY_ATTEMPTS} para ${pendencia.referencia}`);

        const pagamentoConfirmado = await verificarPagamentoIndividual(pendencia.referencia, pendencia.valorComprovante);

        if (pagamentoConfirmado) {
            console.log(`✅ RETRY: Pagamento ${pendencia.referencia} confirmado! Processando...`);
            await processarPagamentoConfirmado(pendencia);
            await removerPagamentoPendente(pendencia.id);
        }
    }

    // Se não há mais pendências, parar timer
    if (Object.keys(pagamentosPendentes).length === 0) {
        pararTimerRetryPagamentos();
    }
}

// Processar pagamento confirmado após retry
async function processarPagamentoConfirmado(pendencia) {
    try {
        const { dadosCompletos, chatId, messageData, resultadoIA } = pendencia;
        const [referencia, megas, numero] = dadosCompletos.split('|');

        // === VERIFICAÇÃO DE VALOR MUITO BAIXO ===
        if (megas === 'VALOR_MUITO_BAIXO') {
            console.log(`❌ VALOR MUITO BAIXO no pagamento confirmado: ${referencia}`);

            const configGrupo = getConfiguracaoGrupo(chatId);
            const precos = ia.extrairPrecosTabela(configGrupo.tabela);
            const menorPreco = Math.min(...precos.map(p => p.preco));

            await client.sendMessage(chatId,
                `❌ *Valor muito baixo*\n\n` +
                `💳 O valor transferido está abaixo do pacote mínimo disponível.\n\n` +
                `📋 *Pacote mais barato:* ${menorPreco}MT\n\n` +
                `💡 *Para ver todos os pacotes:* digite "tabela"`
            );
            return;
        }

        // Enviar mensagem de confirmação
        await client.sendMessage(chatId,
            `✅ *PAGAMENTO CONFIRMADO!*\n\n` +
            `💰 Referência: ${referencia}\n` +
            `📊 Megas: ${megas} MB\n` +
            `📱 Número: ${numero}\n` +
            `💳 Valor: ${pendencia.valorComprovante}MT\n\n` +
            `🎉 Pedido está sendo processado!\n` +
            `⏰ ${new Date().toLocaleString('pt-BR')}`
        );

        // Processar bônus de referência
        const bonusInfo = await processarBonusCompra(chatId, megas);

        // Enviar para Tasker/Planilha
        const resultadoEnvio = await enviarParaTasker(referencia, megas, numero, chatId, messageData.author);

        // Verificar duplicatas
        if (resultadoEnvio && resultadoEnvio.duplicado) {
            await client.sendMessage(chatId,
                `⚠️ *AVISO: PEDIDO DUPLICADO*\n\n` +
                `Este pedido ${resultadoEnvio.status_existente === 'PROCESSADO' ? 'já foi processado' : 'está na fila'}.\n` +
                `Status: ${resultadoEnvio.status_existente}`
            );
            return;
        }

        // === MARCAR PAGAMENTO COMO PROCESSADO APÓS ENVIO BEM-SUCEDIDO ===
        if (resultadoEnvio && resultadoEnvio.sucesso) {
            await marcarPagamentoComoProcessado(referencia, pendencia.valorComprovante);
        }

        // Registrar comprador
        await registrarComprador(chatId, numero, messageData.notifyName, megas);

        // REMOVIDO: Encaminhamento de mensagens (sistema movido para outro bot)

        console.log(`✅ RETRY: Pagamento ${pendencia.referencia} processado com sucesso`);

    } catch (error) {
        console.error(`❌ RETRY: Erro ao processar pagamento confirmado:`, error);
    }
}

// Cache para evitar logs repetidos de grupos
let gruposLogados = new Set();

// === COMANDOS CUSTOMIZADOS ===
let comandosCustomizados = {};
const ARQUIVO_COMANDOS = 'comandos_customizados.json';

// REMOVIDO: Sistema de registro de mensagens (movido para outro bot)

// REMOVIDO: Função registrarPrimeiraMensagem (sistema movido para outro bot)

// Configuração de administradores GLOBAIS
const ADMINISTRADORES_GLOBAIS = [
    '258874100607@c.us',
    '258871112049@c.us',
    '258845356399@c.us',
    '258840326152@c.us',
    '258852118624@c.us',
    '251032533737504@lid', // @lid do Mr Durst
    '251032533737504@lid',
    '203109674577958@c.us',
    '203109674577958@lid',
    '23450974470333@lid',   // ID interno do WhatsApp para 852118624
    // Novos administradores adicionados:
    '258850401416@c.us',    // +258 85 040 1416 - Kelven Junior
    '216054655656152@lid',  // @lid do Kelven Junior
    '258858891101@c.us',    // +258 85 889 1101 - Isaac
    '85307059867830@lid',   // @lid do Isaac
    '258865627840@c.us',    // +258 86 562 7840 - Ercílio
    '170725386272876@lid'   // @lid do Ercílio
];

// Mapeamento de IDs internos (@lid) para números reais (@c.us) - SISTEMA DINÂMICO
let MAPEAMENTO_IDS = {
    '23450974470333@lid': '258852118624@c.us',  // Seu ID
    '245075749638206@lid': null,  // Será identificado automaticamente
    '76991768342659@lid': '258870818180@c.us',  // Joãozinho - corrigido manualmente
    '216054655656152@lid': '258850401416@c.us', // Kelven Junior
    '85307059867830@lid': '258858891101@c.us',  // Isaac
    '170725386272876@lid': '258865627840@c.us',  // Ercílio
    '251032533737504@lid': '258874100607@c.us'  // Mr Durst
};

// === SISTEMA AUTOMÁTICO DE MAPEAMENTO LID ===
const ARQUIVO_MAPEAMENTOS = path.join(__dirname, 'mapeamentos_lid.json');

async function carregarMapeamentos() {
    try {
        // Tentar ler o arquivo diretamente (se não existir, vai dar erro e cai no catch)
        const data = await fs.readFile(ARQUIVO_MAPEAMENTOS, 'utf8');
        const mapeamentosSalvos = JSON.parse(data);
        // Mesclar com os mapeamentos base
        MAPEAMENTO_IDS = { ...MAPEAMENTO_IDS, ...mapeamentosSalvos };
        console.log(`✅ Carregados ${Object.keys(mapeamentosSalvos).length} mapeamentos LID salvos`);
    } catch (error) {
        // Se o arquivo não existir (ENOENT), apenas ignora silenciosamente
        if (error.code === 'ENOENT') {
            console.log('📋 Nenhum arquivo de mapeamentos LID encontrado - usando mapeamentos padrão');
        } else {
            console.error('❌ Erro ao carregar mapeamentos LID:', error.message);
        }
    }
}

async function salvarMapeamentos() {
    try {
        // Filtrar apenas os mapeamentos válidos (não null)
        const mapeamentosValidos = {};
        for (const [lid, numero] of Object.entries(MAPEAMENTO_IDS)) {
            if (numero && numero !== null) {
                mapeamentosValidos[lid] = numero;
            }
        }
        await fs.writeFile(ARQUIVO_MAPEAMENTOS, JSON.stringify(mapeamentosValidos, null, 2));
        console.log(`💾 Salvos ${Object.keys(mapeamentosValidos).length} mapeamentos LID`);
    } catch (error) {
        console.error('❌ Erro ao salvar mapeamentos LID:', error.message);
    }
}

async function adicionarMapeamento(lid, numeroReal) {
    if (!lid || !numeroReal || lid === numeroReal) return false;

    // Validar formato
    if (!lid.endsWith('@lid') || !numeroReal.endsWith('@c.us')) return false;

    // Verificar se já existe
    if (MAPEAMENTO_IDS[lid] === numeroReal) return false;

    // Adicionar novo mapeamento
    MAPEAMENTO_IDS[lid] = numeroReal;
    console.log(`✅ NOVO MAPEAMENTO: ${lid} → ${numeroReal}`);
    await salvarMapeamentos();
    return true;
}

// Função para tentar aprender mapeamento automaticamente quando ambos os formatos estão disponíveis
async function aprenderMapeamento(message) {
    try {
        if (!message.from || !message.author) return;

        const from = message.from; // ID do remetente (pode ser @c.us)
        const author = message.author; // ID do autor (pode ser @lid)

        // Se temos um @lid e um @c.us, podemos aprender o mapeamento
        if (author && author.endsWith('@lid') && from && from.endsWith('@c.us')) {
            // Extrair número base para validar se correspondem
            const numeroLid = author.replace('@lid', '');
            const numeroReal = from.replace('@c.us', '');

            // Tentar encontrar uma correspondência lógica (primeiros dígitos, etc.)
            // Por enquanto, sempre tentar mapear se não temos o mapeamento
            if (!MAPEAMENTO_IDS[author]) {
                await adicionarMapeamento(author, from);
                console.log(`🔍 APRENDIZADO: Detectado possível mapeamento ${author} → ${from}`);
            }
        }
    } catch (error) {
        // Silencioso - não queremos spam nos logs
    }
}

// === CONFIGURAÇÃO DE MODERAÇÃO ===
const MODERACAO_CONFIG = {
    ativado: {
        '258820749141-1441573529@g.us': true,
        '120363152151047451@g.us': true,
        '258840161370-1471468657@g.us': true
    },
    detectarLinks: true,
    apagarMensagem: true,
    removerUsuario: true, // DESATIVADO: não remove mais usuários, apenas apaga a mensagem
    excecoes: [
        '258861645968@c.us',
        '258871112049@c.us',
        '258852118624@c.us'
    ]
};

// Configuração para cada grupo
const CONFIGURACAO_GRUPOS = {
       '258820749141-1441573529@g.us': {
        nome: 'Data Store - Vodacom',
        tabela: `✅🔥🚨PROMOÇÃO DE 🛜MEGAS VODACOM AO MELHOR PREÇO DO MERCADO - OUTUBRO 2025🚨🔥✅

📆 PACOTES DIÁRIOS
512MB 💎 10MT 💵💽
1024MB 💎 17MT 💵💽
1200MB 💎 20MT 💵💽
2048MB 💎 34MT 💵💽
2200MB 💎 40MT 💵💽
3072MB 💎 51MT 💵💽
4096MB 💎 68MT 💵💽
5120MB 💎 85MT 💵💽
6144MB 💎 102MT 💵💽
7168MB 💎 119MT 💵💽
8192MB 💎 136MT 💵💽
9144MB 💎 153MT 💵💽
10240MB 💎 170MT 💵💽

📅 PACOTES PREMIUM (3 Dias – Renováveis)
2000MB 💎 44MT 💵💽
3000MB 💎 66MT 💵💽
4000MB 💎 88MT 💵💽
5000MB 💎 109MT 💵💽
6000MB 💎 133MT 💵💽
7000MB 💎 149MT 💵💽
10000MB 💎 219MT 💵💽
🔄 Bônus: 100MB extra ao atualizar dentro de 3 dias

📅 SEMANAIS BÁSICOS (5 Dias – Renováveis)
1700MB 💎 45MT 💵💽
2900MB 💎 80MT 💵💽
3400MB 💎 110MT 💵💽
5500MB 💎 150MT 💵💽
7800MB 💎 200MT 💵💽
11400MB 💎 300MT 💵💽
🔄 Bônus: 100MB extra ao atualizar dentro de 5 dias

📅 SEMANAIS PREMIUM (15 Dias – Renováveis)
3000MB 💎 100MT 💵💽
5000MB 💎 149MT 💵💽
8000MB 💎 201MT 💵💽
10000MB 💎 231MT 💵💽
20000MB 💎 352MT 💵💽
🔄 Bônus: 100MB extra ao atualizar dentro de 15 dias

📅 PACOTES MENSAIS
12.8GB 💎 270MT 💵💽
22.8GB 💎 435MT 💵💽
32.8GB 💎 605MT 💵💽
52.8GB 💎 945MT 💵💽
60.2GB 💎 1249MT 💵💽
80.2GB 💎 1449MT 💵💽
100.2GB 💎 1700MT 💵💽

💎 PACOTES DIAMANTE MENSAIS
Chamadas + SMS ilimitadas + 11GB 💎 460MT 💵
Chamadas + SMS ilimitadas + 24GB 💎 820MT 💵
Chamadas + SMS ilimitadas + 50GB 💎 1550MT 💵
Chamadas + SMS ilimitadas + 100GB 💎 2250MT 💵

📍 NB: Válido apenas para Vodacom  
📍 Para o Pacote Mensal e Diamante, não deve ter Txuna crédito ativo!
`,

        pagamento: `FORMAS DE PAGAMENTO ATUALIZADAS
 
1- M-PESA 
NÚMERO: 848715208
NOME:  NATACHA ALICE

NÚMERO: 871112049
NOME: NATACHA ALICE`
    },
    '120363402609218031@g.us': {
        nome: 'NET PROMOÇÃO 17MT V12',
        tabela: `NB: SOMENTE MEGAS DA VODACOM 👇🏼👇🏼👇🏼 E CHAMADAS PARA TODAS REDES 📞📞📞

📆 PLANO DIÁRIO (24H)
1024MB  =  17MT  
1250MB  =  23MT  
2048MB  =  34MT  
3072MB  =  51MT  
4096MB  =  68MT  
5120MB  =  85MT  
10100MB =  170MT  
20400MB =  390MT  

📅 PLANO SEMANAL (7 DIAS)
1.7GB  =  47MT  
3.4GB  =  97MT  
5.2GB  =  147MT  
7.1GB  =  196MT  
10.7GB =  296MT  
14.3GB =  396MT  

📅 DIAMANTE SEMANAL TUDO TOP ILIMITADO
7.5GB + Chamadas e SMS Ilimitado para todas redes  =  265MT  

📅 PLANO MENSAL (30 DIAS)
5GB  =  170MT  
10GB =  320MT  
15GB =  440MT  
20GB =  540MT  
25GB =  720MT  
30GB =  850MT  

📅 DIAMANTE TUDO TOP ILIMITADO (30 DIAS)
11GB + Chamadas e SMS ilimitadas + 10min + 30MB ROAM  =  445MT  
13GB + Chamadas e SMS ilimitadas para todas redes  =  545MT  
20GB + Chamadas e SMS ilimitadas + 20min + 80MB ROAM  =  900MT  

📞 CHAMADAS PARA TODAS REDES SEMANAL
1.5GB + 140 MIN + 500 SMS (7 DIAS)  =  98MT  
119 MIN  =  48MT
`,

        pagamento: `🤖 Formas de Pagamento

🟧E-mola:870718396__[FREDERICO FELICIANO SIMANGO]

🟥M-Pesa:857013922__[SHAT TERCIANA]


Em seguida mande a mensagem de comprovativo
Aqui no grupo`
    },
    '120363020570328377@g.us': {
        nome: ' NET VODACOM ACESSÍVEL',
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



🚨QUANDO PRECISAREM PACOTE MENSAL, ENTRA EM CONTACTO ATRAVÉS DO LINK ABAIXO 👇👇🚨

https://wa.me/258858891101?text=%20Quero%20pacote%20mensal!%20


QUANDO PRECISAREM DO  ILIMITADO, EMTREM EM CONTACTO COM O LINK 
https://wa.me/258858891101?text=%20Quero%20pacote%20ilimitado!%20


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
    },
    '120363022366545020@g.us': {
        nome: 'MNGmegas Elite Net',
        tabela: `🚨MB DA VODACOM 📶🌐

🔥 Imperdível! Nosso pacote diário e semanal, txuna! Não leva💸
⚡ Aproveite já, pode acabar a qualquer momento! 🚀

⏰PACOTE DIÁRIO🛒📦
🌐256MB = 7MT
🌐512MB = 10MT
🌐1024MB = 17MT
🌐1280MB = 25MT
🌐2048MB = 34MT
🌐3072MB = 51MT
🌐4096MB = 68MT
🌐5120MB = 85MT
🌐6144MB = 102MT
🌐7168MB = 119MT
🌐8192MB = 136MT
🌐9216MB = 153MT
🌐10240MB = 170MT

 📅PACOTE SEMANAL🛒📦
⚠ Vai receber 100MB por dia durante 6 dias, totalizando +0.6GB. ⚠

📡3.0GB = 89MT 
📡5.0GB = 133MT
📡6.0GB = 158MT 
📡7.0GB = 175MT 
📡10.0GB = 265MT

> PARA VER TABELA DO PACOTE MENSAL DIGITE: Mensal

> PARA VER TABELA DO PACOTE  ILIMITADO DIGITE: Ilimitado


💳FORMA DE PAGAMENTO:

M-Pesa: 853529033 📱
- Ercílio UANELA 
e-Mola: 865627840 📱
- Alexandre UANELA 

✨ Mais Rápido, Mais Barato, Mais Confiável! ✨

`,

        pagamento: `formas de pagamento💰💶

📌 m-pesa: 853529033 
   nome: ercílio uanela 

📌 e-mola: 865627840 
    nome: alexandre uanela  

📮 após a transferência enviei o comprovante em forma do cópia junto com seu número.
 
> 1. 🚨não mande comprovativo em formato de imagem 📸🚨

> 2.  🚨 não mande valor que não têm na tabela🚨

🚀 o futuro é agora! vamos? 🔥🛒
`
    },
    '120363402302455817@g.us': {
        nome: 'KA-NET',
        tabela: `SUPER PROMOÇÃO NA VODACOM🛑🔥😍

📆 PACOTES DIÁRIOS
512MB = 10MT
1024MB = 16MT
1200MB = 20MT
1560MB = 25MT
2048MB = 32MT
3200MB = 54MT 
4250MB = 68MT 
5350MB = 90MT 
10240MB = 160MT

⿣PACOTE DIÁRIO PREMIUM (3 Dias)
300MB + 2000MB = 40MT
300MB + 3000MB = 66MT 
300MB + 4000MB = 72MT 
300MB + 5000MB = 85MT
300MB + 6000MB = 110MT 
300MB + 7000MB = 125MT 
300MB + 10000MB = 180MT 

⿧PACOTE SEMANAL (5 dias)
500MB + 5000MB = 95MT
500MB + 8000MB = 140MT
500MB + 10000MB = 190MT
500MB + 15000MB = 290MT

Mensal (Válido Por 30 Dias)
5GB = 150MT
10GB = 250MT
35GB = 710MT
50GB = 1030MT
100GB = 2040MT

📅 PACOTES DIAMANTE MENSAIS 💎
Chamadas + SMS ilimitadas + 11GB = 440MT 
Chamadas + SMS ilimitadas + 24GB = 820MT 
Chamadas + SMS ilimitadas + 50GB = 1550MT 
Chamadas + SMS ilimitadas + 100GB = 2250MT
`,
        pagamento: `- 📲 𝗘-𝗠𝗢𝗟𝗔: 864882152💶💰
- Catia Anabela Nharrava 
- 📲 𝗠-𝗣𝗘𝗦𝗔: 856268811💷💰 
- ↪📞Kelven Junior Anabela Nharrava
`
    }, 
'120363043964227338@g.us': {
        nome: 'ASTRO BOOSTING I',
        tabela: `📢 SUPER PROMOÇÃO DE INTERNET - VODACOM  

📋 TABELA DE MEGAS DIÁRIOS
1GB  =  18MT  
2GB  =  36MT  
3GB  =  54MT  
4GB  =  72MT  
5GB  =  90MT  
6GB  =  108MT  
7GB  =  126MT  
8GB  =  144MT  
9GB  =  162MT  
10GB =  180MT  (Para Patrões 🤩)  

📅 MEGAS SEMANAIS
4.36GB =  110MT  
6.50GB =  180MT  
9.76GB =  250MT  

📅 MEGAS MENSAIS
3GB  =  160MT  
6GB  =  200MT  
10GB =  300MT  

= PACOTES DIAMANTE
11GB + Chamadas e SMS Ilimitadas + 10min Internacionais + 30MB Roaming  =  450MT
`,

        pagamento: `╭━━━┛ 💸  𝗙𝗢𝗥𝗠𝗔𝗦 𝗗𝗘 𝗣𝗔𝗚𝗔𝗠𝗘𝗡𝗧𝗢:  
┃  
┃ 🪙 𝗘-𝗠𝗼𝗹𝗮:  
┃    879833297  
┃     👤 𝗧𝗶𝘁𝘂𝗹𝗮𝗿: 𝗖𝗵𝗲𝗹𝘁𝗼𝗻 𝗱𝗼𝘀 𝗦𝗮𝗻𝘁𝗼𝘀  
┃  
┃ 🪙 𝗠-𝗣𝗲𝘀𝗮:  
┃    846418280  
┃     👤 𝗧𝗶𝘁𝘂𝗹𝗮𝗿: 𝗩𝗮𝗹𝘁𝗲𝗿 𝗱𝗼𝘀 𝗔𝗻𝗷𝗼𝘀  
┃   
┃  
┃ ⚠ 𝗜𝗠𝗣𝗢𝗥𝗧𝗔𝗡𝗧𝗘:  
┃     ▪ 𝗣𝗮𝗿𝗮 𝗮𝗾𝘂𝗶𝘀𝗶𝗰̧𝗮̃𝗼, 𝗲𝗻𝘃𝗶𝗲:  
┃         𝟭⃣ 𝗢 𝘃𝗮𝗹𝗼𝗿  
┃         𝟮⃣ 𝗢 𝗰𝗼𝗺𝗽𝗿𝗼𝘃𝗮𝘁𝗶𝘃𝗼  
┃         𝟯⃣ 𝗢 𝗻𝘂́𝗺𝗲𝗿𝗼 𝗾𝘂𝗲 𝘃𝗮𝗶 𝗿𝗲𝗰𝗲𝗯𝗲𝗿 𝗼𝘀 𝗺𝗲𝗴𝗮𝘀  
┃  
╰━━━━━━━━━━━━━━━━━━━━━  
        🚀 𝗢 𝗳𝘂𝘁𝘂𝗿𝗼 𝗲́ 𝗮𝗴𝗼𝗿𝗮. 𝗩𝗮𝗺𝗼𝘀?
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
        console.log(`📊 Enviando para Google Sheets: ${referencia}`);
        console.log(`🔍 Dados enviados:`, JSON.stringify(dados, null, 2));
        console.log(`🔗 URL destino:`, GOOGLE_SHEETS_CONFIG.scriptUrl);

        // Usar axios COM RETRY para Google Sheets
        const response = await axiosComRetry({
            method: 'post',
            url: GOOGLE_SHEETS_CONFIG.scriptUrl,
            data: dados,
            headers: {
                'Content-Type': 'application/json',
                'X-Bot-Source': 'WhatsApp-Bot-Pooled'
            }
        }, 3); // 3 tentativas
        
        // Google Apps Script agora retorna JSON
        const responseData = response.data;
        console.log(`📥 Resposta Google Sheets:`, JSON.stringify(responseData, null, 2));

        // Verificar se é uma resposta JSON válida
        if (typeof responseData === 'object') {
            if (responseData.success) {
                console.log(`✅ Google Sheets: Dados enviados!`);
                return { sucesso: true, referencia: responseData.referencia, duplicado: false };
            } else if (responseData.duplicado) {
                console.log(`⚠️ Google Sheets: Pedido duplicado detectado - ${responseData.referencia} (Status: ${responseData.status_existente})`);
                return {
                    sucesso: false,
                    duplicado: true,
                    referencia: responseData.referencia,
                    status_existente: responseData.status_existente,
                    message: responseData.message
                };
            } else {
                throw new Error(responseData.message || 'Erro desconhecido');
            }
        } else {
            // Fallback para compatibilidade com resposta em texto
            const responseText = String(responseData);
            if (responseText.includes('Sucesso!')) {
                console.log(`✅ Google Sheets: Dados enviados!`);
                return { sucesso: true, row: 'N/A', duplicado: false };
            } else if (responseText.includes('Erro:')) {
                throw new Error(responseText);
            } else {
                throw new Error(`Resposta inesperada: ${responseText}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ Erro Google Sheets [${grupoNome}]: ${error.message}`);
        return { sucesso: false, erro: error.message };
    }
}

// === FUNÇÃO PRINCIPAL PARA TASKER ===
async function enviarParaTasker(referencia, valor, numero, grupoId, autorMensagem) {
    const grupoNome = getConfiguracaoGrupo(grupoId)?.nome || 'Desconhecido';
    const timestamp = new Date().toLocaleString('pt-BR');
    const linhaCompleta = `${referencia}|${valor}|${numero}`;

    console.log(`📊 ENVIANDO PARA GOOGLE SHEETS [${grupoNome}]: ${linhaCompleta}`);

    // === VALIDAÇÕES PREVENTIVAS ===
    if (!referencia || !valor || !numero) {
        console.error(`❌ VALIDAÇÃO FALHOU: Dados incompletos - referencia=${referencia}, valor=${valor}, numero=${numero}`);
        return {
            sucesso: false,
            erro: 'Dados incompletos para envio'
        };
    }

    // Validar formato da referência
    if (typeof referencia !== 'string' || referencia.length < 3) {
        console.error(`❌ VALIDAÇÃO FALHOU: Referência inválida - ${referencia}`);
        return {
            sucesso: false,
            erro: 'Referência inválida'
        };
    }

    // Validar número
    const numeroLimpo = String(numero).replace(/[^0-9]/g, '');
    if (numeroLimpo.length < 9) {
        console.error(`❌ VALIDAÇÃO FALHOU: Número inválido - ${numero}`);
        return {
            sucesso: false,
            erro: 'Número de telefone inválido'
        };
    }

    // Validar URL do Google Sheets
    if (!GOOGLE_SHEETS_CONFIG.scriptUrl || GOOGLE_SHEETS_CONFIG.scriptUrl === '') {
        console.error(`❌ VALIDAÇÃO FALHOU: URL do Google Sheets não configurada`);
        return {
            sucesso: false,
            erro: 'Google Sheets não configurado'
        };
    }

    // Cache da transação
    const transacaoKey = `${grupoId}_${Date.now()}_${numero}`;
    cacheTransacoes.set(transacaoKey, {
        dados: linhaCompleta,
        grupo_id: grupoId,
        grupo: grupoNome,
        autor: autorMensagem,
        timestamp: timestamp,
        enviado: false,
        metodo: 'pendente'
    });

    // === TENTAR GOOGLE SHEETS COM RETRY ===
    let tentativas = 0;
    let resultado = null;
    const maxTentativas = 3;

    while (tentativas < maxTentativas) {
        tentativas++;

        try {
            console.log(`🔄 Tentativa ${tentativas}/${maxTentativas} de envio para Google Sheets...`);
            resultado = await enviarParaGoogleSheets(referencia, valor, numero, grupoId, grupoNome, autorMensagem);

            if (resultado.sucesso) {
                break; // Sucesso, sair do loop
            } else if (resultado.duplicado) {
                break; // Duplicado, sair do loop (não tentar novamente)
            } else {
                console.warn(`⚠️ Tentativa ${tentativas} falhou:`, resultado.erro || 'Erro desconhecido');

                // Aguardar antes de tentar novamente (exceto na última tentativa)
                if (tentativas < maxTentativas) {
                    const delay = tentativas * 2000; // 2s, 4s
                    console.log(`⏳ Aguardando ${delay/1000}s antes da próxima tentativa...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        } catch (error) {
            console.error(`❌ Erro na tentativa ${tentativas}:`, error.message);

            // Aguardar antes de tentar novamente (exceto na última tentativa)
            if (tentativas < maxTentativas) {
                const delay = tentativas * 2000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    if (resultado && resultado.sucesso) {
        // Atualizar cache
        if (cacheTransacoes.has(transacaoKey)) {
            const transacao = cacheTransacoes.get(transacaoKey);
            transacao.enviado = true;
            transacao.metodo = 'google_sheets';
            transacao.row = resultado.row;
        }
        console.log(`✅ [${grupoNome}] Enviado para Google Sheets com sucesso! Row: ${resultado.row}`);

        // === REGISTRAR COMPRA PENDENTE NO SISTEMA DE COMPRAS ===
        if (sistemaCompras) {
            try {
                // Extrair apenas o número do autorMensagem (remover @c.us se houver)
                const numeroRemetente = autorMensagem.replace('@c.us', '');
                console.log(`🔍 DEBUG COMPRA: autorMensagem="${autorMensagem}" | numeroRemetente="${numeroRemetente}" | numero="${numero}"`);
                await sistemaCompras.registrarCompraPendente(referencia, numero, valor, numeroRemetente, grupoId);
            } catch (error) {
                console.error('❌ Erro ao registrar compra pendente:', error);
                // Não falhar o envio por causa disso
            }
        }

        return {
            sucesso: true,
            referencia: referencia,
            row: resultado.row,
            linhaCompleta: linhaCompleta
        };

    } else if (resultado && resultado.duplicado) {
        // Marcar como duplicado no cache
        if (cacheTransacoes.has(transacaoKey)) {
            cacheTransacoes.get(transacaoKey).status = 'duplicado';
        }
        console.log(`🛑 [${grupoNome}] Pedido duplicado detectado: ${referencia}`);

        // Retornar informações do duplicado para o bot processar
        return {
            sucesso: false,
            duplicado: true,
            referencia: resultado.referencia,
            status_existente: resultado.status_existente,
            message: resultado.message
        };
    } else {
        // Todas as tentativas falharam
        console.error(`❌ [${grupoNome}] TODAS AS ${maxTentativas} TENTATIVAS FALHARAM para ${referencia}`);
        if (cacheTransacoes.has(transacaoKey)) {
            cacheTransacoes.get(transacaoKey).metodo = 'falhou';
        }

        return {
            sucesso: false,
            erro: resultado?.erro || 'Falha ao enviar para Google Sheets após múltiplas tentativas',
            tentativas: maxTentativas
        };
    }
}

// REMOVIDO: Função enviarViaWhatsAppTasker
// (Sistema de encaminhamento movido para outro bot)

// === FUNÇÃO REMOVIDA PARA OTIMIZAÇÃO ===
// Não salva mais arquivos .txt desnecessários
// async function salvarArquivoTasker() - REMOVIDA

function obterDadosTasker() {
    return Array.from(cacheTransacoes.values());
}

function obterDadosTaskerHoje() {
    const hoje = new Date().toDateString();
    return Array.from(cacheTransacoes.values()).filter(item => {
        const dataItem = new Date(item.timestamp).toDateString();
        return dataItem === hoje;
    });
}

// === FUNÇÕES PARA TASKER - SISTEMA DE PACOTES ===
function obterDadosPacotesTasker() {
    if (!sistemaPacotes) return [];
    
    const clientes = Object.values(sistemaPacotes.clientesAtivos);
    return clientes.map(cliente => ({
        numero: cliente.numero,
        referenciaOriginal: cliente.referenciaOriginal,
        tipoPacote: cliente.tipoPacote,
        diasRestantes: cliente.diasRestantes,
        proximaRenovacao: cliente.proximaRenovacao,
        status: cliente.status,
        grupoId: cliente.grupoId
    }));
}

function obterRenovacoesPendentesTasker() {
    if (!sistemaPacotes) return [];
    
    const agora = new Date();
    const proximas6h = new Date(agora.getTime() + (6 * 60 * 60 * 1000));
    
    const clientes = Object.values(sistemaPacotes.clientesAtivos);
    return clientes.filter(cliente => {
        const proximaRenovacao = new Date(cliente.proximaRenovacao);
        return proximaRenovacao <= proximas6h && cliente.diasRestantes > 0;
    }).map(cliente => ({
        numero: cliente.numero,
        referenciaOriginal: cliente.referenciaOriginal,
        tipoPacote: cliente.tipoPacote,
        proximaRenovacao: cliente.proximaRenovacao,
        diasRestantes: cliente.diasRestantes
    }));
}

// === COMANDOS CUSTOMIZADOS - FUNÇÕES ===

async function carregarComandosCustomizados() {
    try {
        const data = await fs.readFile(ARQUIVO_COMANDOS, 'utf8');
        comandosCustomizados = JSON.parse(data);
        console.log(`📝 Comandos customizados carregados: ${Object.keys(comandosCustomizados).length} grupos`);
    } catch (error) {
        comandosCustomizados = {};
        console.log('📝 Arquivo de comandos não existe, criando estrutura vazia');
    }
}

async function salvarComandosCustomizados() {
    try {
        await fs.writeFile(ARQUIVO_COMANDOS, JSON.stringify(comandosCustomizados));
        console.log('✅ Comandos customizados salvos');
    } catch (error) {
        console.error('❌ Erro ao salvar comandos:', error);
    }
}

function parsearComandoCustomizado(texto) {
    // Regex para capturar: .addcomando Nome_do_comando(resposta)
    const regex = /^\.addcomando\s+(\w+)\s*\((.+)\)$/s;
    const match = texto.match(regex);
    
    if (match) {
        return {
            nome: match[1].toLowerCase(),
            resposta: match[2].trim()
        };
    }
    return null;
}

async function adicionarComandoCustomizado(chatId, nomeComando, resposta, autorId) {
    if (!comandosCustomizados[chatId]) {
        comandosCustomizados[chatId] = {};
    }
    
    comandosCustomizados[chatId][nomeComando] = {
        resposta: resposta,
        criadoPor: autorId,
        criadoEm: new Date().toISOString()
    };
    
    await salvarComandosCustomizados();
    console.log(`✅ Comando '${nomeComando}' adicionado ao grupo ${chatId}`);
}

async function removerComandoCustomizado(chatId, nomeComando) {
    if (comandosCustomizados[chatId] && comandosCustomizados[chatId][nomeComando]) {
        delete comandosCustomizados[chatId][nomeComando];
        
        // Se não há mais comandos no grupo, remove a entrada do grupo
        if (Object.keys(comandosCustomizados[chatId]).length === 0) {
            delete comandosCustomizados[chatId];
        }
        
        await salvarComandosCustomizados();
        console.log(`🗑️ Comando '${nomeComando}' removido do grupo ${chatId}`);
        return true;
    }
    return false;
}

function executarComandoCustomizado(chatId, comando) {
    if (comandosCustomizados[chatId] && comandosCustomizados[chatId][comando]) {
        return comandosCustomizados[chatId][comando].resposta;
    }
    return null;
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
    // Se for @lid, tentar converter para @c.us ANTES de verificar cache
    let numeroParaVerificar = numero;

    if (numero.includes('@lid')) {
        // Verificar se está no mapeamento
        if (MAPEAMENTO_IDS[numero]) {
            numeroParaVerificar = MAPEAMENTO_IDS[numero];
            console.log(`🔄 Admin check: Convertido ${numero} -> ${numeroParaVerificar}`);
        } else {
            // Tentar extrair número base e procurar no ADMINISTRADORES_GLOBAIS
            const numeroBase = numero.split('@')[0];
            const adminEncontrado = ADMINISTRADORES_GLOBAIS.find(admin =>
                admin.startsWith(numeroBase + '@')
            );
            if (adminEncontrado) {
                numeroParaVerificar = adminEncontrado;
                console.log(`🔄 Admin check: Convertido ${numero} -> ${numeroParaVerificar} (por número base)`);
            }
        }
    }

    // Agora verificar cache com o número convertido
    const cached = adminCache.get(numeroParaVerificar);
    if (cached !== undefined && cached !== null) {
        return cached;
    }

    // Calcular e cachear resultado
    const isAdmin = ADMINISTRADORES_GLOBAIS.includes(numeroParaVerificar);
    adminCache.set(numeroParaVerificar, isAdmin);
    // Cachear também o ID original se foi convertido
    if (numeroParaVerificar !== numero) {
        adminCache.set(numero, isAdmin);
    }

    return isAdmin;
}

function isGrupoMonitorado(chatId) {
    return CONFIGURACAO_GRUPOS.hasOwnProperty(chatId);
}

function getConfiguracaoGrupo(chatId) {
    return CONFIGURACAO_GRUPOS[chatId] || null;
}

// Função para resolver ID interno (@lid) para número real (@c.us)
function resolverIdReal(participantId, adminsEncontrados) {
    // Se já é @c.us, retorna como está
    if (participantId.endsWith('@c.us')) {
        return participantId;
    }
    
    // Se tem mapeamento conhecido, usa ele
    if (MAPEAMENTO_IDS[participantId]) {
        return MAPEAMENTO_IDS[participantId];
    }
    
    // Se é @lid, tenta encontrar correspondência nos admins
    if (participantId.endsWith('@lid')) {
        // Para agora, retorna o próprio ID para permitir comparação direta
        return participantId;
    }
    
    return participantId;
}

// Função para converter LID para número usando API oficial do wwebjs
async function lidParaNumero(lid) {
    try {
        console.log(`🔍 INICIO: Convertendo LID para número: ${lid}`);
        console.log(`🔍 CLIENTE: Status do cliente: ${client ? 'disponível' : 'não disponível'}`);

        if (!client) {
            console.error(`❌ Cliente WhatsApp não está disponível para conversão LID`);
            return null;
        }

        // Verificar se o cliente está realmente pronto
        try {
            const info = await client.getState();
            console.log(`🔍 ESTADO: Cliente estado: ${info}`);
            if (info !== 'CONNECTED') {
                console.error(`❌ Cliente não está conectado (estado: ${info}) - não é possível converter LID`);
                return null;
            }
        } catch (stateError) {
            console.error(`❌ Erro ao verificar estado do cliente:`, stateError.message);
            return null;
        }

        console.log(`🔍 CHAMANDO: client.getContactById(${lid})`);
        const contato = await client.getContactById(lid);
        console.log(`🔍 CONTATO: Objeto recebido:`, contato ? 'OK' : 'NULL');

        if (!contato) {
            console.error(`❌ Contato não encontrado para LID: ${lid}`);
            return null;
        }

        const numeroReal = contato.number;
        console.log(`✅ LID convertido com sucesso: ${lid} → ${numeroReal}`);
        return numeroReal; // Retorna número no formato internacional (ex: 258841234567)
    } catch (err) {
        console.error(`❌ Erro detalhado ao buscar número para LID ${lid}:`, err.message);
        console.error(`❌ Stack trace:`, err.stack);
        return null;
    }
}


// FUNÇÕES DE VERIFICAÇÃO DE ADMIN DO GRUPO REMOVIDAS
// Agora usa apenas isAdministrador() com ADMINISTRADORES_GLOBAIS

function contemConteudoSuspeito(mensagem) {
    const texto = mensagem.toLowerCase();

    // Detectar apenas URLs reais, não a palavra "link"
    // Regex atualizado para detectar apenas links reais (http://, https://, www., ou domínios completos)
    // Explicação:
    // - https?://...  -> URLs com esquema
    // - www....       -> URLs começando com www
    // - domínio.tld    -> detectar padrões como example.com (lista de TLDs comuns)
    // - encurtadores  -> bit.ly, tinyurl.com, t.me, wa.me, whatsapp.com, telegram.me
    const temLink = /(?:https?:\/\/[\S]+|www\.[\S]+|(?:bit\.ly|tinyurl\.com|t\.me|wa\.me|whatsapp\.com|telegram\.me)\/[\S]+|[a-z0-9\-]+\.(?:com|net|org|io|br|co|xyz|online|info|biz|me|us|edu|gov)(?:[\/\s]|$))/i.test(texto);

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
        // Ativar moderação para todos os grupos que estiverem em CONFIGURACAO_GRUPOS.
        // Se o grupo está listado em CONFIGURACAO_GRUPOS a moderação será aplicada independente de entradas conflitantes em MODERACAO_CONFIG.ativado.
        const ativadoExplicit = CONFIGURACAO_GRUPOS.hasOwnProperty(chatId) ||
            (MODERACAO_CONFIG.ativado && MODERACAO_CONFIG.ativado[chatId]);

        if (!ativadoExplicit) return;

        if (MODERACAO_CONFIG.excecoes.includes(authorId) || isAdministrador(authorId)) {
            return;
        }

        console.log(`🚨 MODERAÇÃO: ${motivoDeteccao}`);

        if (MODERACAO_CONFIG.apagarMensagem) {
            await deletarMensagem(message);
        }

        if (MODERACAO_CONFIG.removerUsuario) {
            // Tentar obter informações do contato para menção/nomes
            let mentionId = String(authorId).replace('@c.us', '').replace('@lid', '');
            let nomeExibicao = mentionId;
            try {
                const contato = await client.getContactById(authorId);
                if (contato) {
                    nomeExibicao = contato.pushname || contato.name || contato.number || mentionId;
                }
            } catch (err) {
                // ignora erro de obtenção de contato, usaremos o ID reduzido
            }

            // Enviar aviso ao grupo antes/depois da remoção
            try {
                const aviso = `🚫 @${mentionId} foi removido(a) do grupo por enviar link.`;
                await client.sendMessage(chatId, aviso, { mentions: [authorId] });
            } catch (errAviso) {
                // Se o envio do aviso falhar, não interromper a remoção
                console.log('⚠️ Não foi possível enviar aviso de remoção:', errAviso.message);
            }

            const removido = await removerParticipante(chatId, authorId, motivoDeteccao);

            if (!removido) {
                try {
                    const avisoErro = `⚠️ Não foi possível remover @${mentionId}. Verifique se o bot tem permissões de administrador.`;
                    await client.sendMessage(chatId, avisoErro, { mentions: [authorId] });
                } catch (err2) {
                    console.log('⚠️ Falha ao notificar sobre remoção mal-sucedida:', err2.message);
                }
            }
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

// === SALVAMENTO DE HISTÓRICO OTIMIZADO ===
let salvamentoHistoricoPendente = false;
let timeoutHistorico = null;

async function salvarHistorico() {
    if (salvamentoHistoricoPendente) return;
    salvamentoHistoricoPendente = true;

    try {
        await fs.writeFile(ARQUIVO_HISTORICO, JSON.stringify(historicoCompradores));
    } catch (error) {
        console.error('❌ Erro ao salvar histórico:', error);
    } finally {
        salvamentoHistoricoPendente = false;
    }
}

function agendarSalvamentoHistorico() {
    if (timeoutHistorico) {
        clearTimeout(timeoutHistorico);
    }

    timeoutHistorico = setTimeout(async () => {
        agendarSalvamentoHistorico();
        timeoutHistorico = null;
    }, 3000); // 3 segundos para histórico
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

    agendarSalvamentoHistorico();
    console.log(`💰 Comprador registrado: ${nomeContato} (${numeroComprador}) - ${valorTransferencia}MT`);
}

// === FILA DE MENSAGENS ===

// REMOVIDO: Funções de processamento de fila de encaminhamento
// (Sistema movido para outro bot)

// === EVENTOS DO BOT ===

client.on('qr', (qr) => {
    console.log('📱 QR Code gerado - Escaneie o QR Code:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('🔐 Cliente autenticado com sucesso!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Falha na autenticação:', msg);
});

client.on('loading_screen', (percent, message) => {
    console.log('⏳ Carregando WhatsApp...', percent + '%', message);
});

client.on('ready', async () => {
    console.log('✅ Bot conectado e pronto!');
    console.log('🧠 IA WhatsApp ativa!');
    console.log('📊 Google Sheets configurado!');
    console.log(`🔗 URL: ${GOOGLE_SHEETS_CONFIG.scriptUrl}`);
    console.log('🤖 Bot Retalho - Lógica simples igual ao Bot Atacado!');

    // Verificar se acabou de reiniciar e notificar grupos
    await verificarPosRestart();

    // Carregar mapeamentos LID salvos
    await carregarMapeamentos();

    // REMOVIDO: Carregamento de registro de mensagens (sistema movido para outro bot)

    // === INICIALIZAR SISTEMA DE RELATÓRIOS ===
    try {
        global.sistemaRelatorios = new SistemaRelatorios(client, GOOGLE_SHEETS_CONFIG, PAGAMENTOS_CONFIG);

        // Carregar configurações salvas
        await global.sistemaRelatorios.carregarConfiguracoes();

        // Iniciar agendamento às 22h
        global.sistemaRelatorios.iniciarAgendamento();

        console.log('📊 Sistema de relatórios iniciado!');
        console.log('⏰ Relatórios agendados para 22:00 diariamente');
        console.log('💰 Preço de compra: 12 MT/GB | Revenda: 16-18 MT/GB');
        console.log('📞 Comandos: .config-relatorio .list-relatorios .remove-relatorio .test-relatorio');

    } catch (error) {
        console.error('❌ Erro ao iniciar sistema de relatórios:', error.message);
    }

    // === INICIALIZAR SISTEMA DE RETRY SILENCIOSO ===
    await carregarPagamentosPendentes();
    console.log('🔄 Sistema de Retry Silencioso ATIVADO!');
    
    // === INICIALIZAR SISTEMA DE PACOTES APÓS WhatsApp CONECTAR ===
    if (process.env.SISTEMA_PACOTES_ENABLED === 'true') {
        sistemaPacotes = new SistemaPacotes();
        console.log('📦 Sistema de Pacotes Automáticos ATIVADO');
    } else {
        console.log('📦 Sistema de Pacotes Automáticos DESABILITADO (.env)');
    }
    
    // === INICIALIZAR SISTEMA DE COMPRAS ===
    sistemaCompras = new SistemaCompras();
    console.log('🛒 Sistema de Registro de Compras ATIVADO');

    // === INICIALIZAR SISTEMA DE BÔNUS ===
    sistemaBonus = new SistemaBonus();
    await sistemaBonus.carregarDados();
    console.log('💰 Sistema de Bônus ATIVADO');

    // Carregar dados de referência (legado - será migrado)
    await carregarDadosReferencia();
    
    await carregarHistorico();
    
    console.log('\n🤖 Monitorando grupos:');
    Object.keys(CONFIGURACAO_GRUPOS).forEach(grupoId => {
        const config = CONFIGURACAO_GRUPOS[grupoId];
        console.log(`   📋 ${config.nome} (${grupoId})`);
    });
    
    console.log('\n🔧 Comandos admin: .ia .stats .sheets .test_sheets .test_grupo .grupos_status .grupos .grupo_atual .addcomando .comandos .delcomando .test_vision .ranking .inativos .detetives .semcompra .resetranking .bonus .testreferencia .config-relatorio .list-relatorios .remove-relatorio .test-relatorio');

    // Monitoramento de novos membros DESATIVADO
    console.log('⏸️ Monitoramento automático de novos membros DESATIVADO');
});

// Event group-join DESATIVADO
client.on('group-join', async (notification) => {
    // Sistema de boas-vindas automáticas DESATIVADO - código removido completamente
    console.log('⏸️ Event group-join ignorado - sistema desativado');
    return;
});

// === HANDLERS SEPARADOS POR TIPO DE COMANDO ===
async function handleAdminCommands(message) {
    const autorMensagem = message.author || message.from;
    const comando = message.body.toLowerCase().trim();

    // Comando .souadmin - QUALQUER pessoa pode usar para verificar se é admin
    if (comando === '.souadmin') {
        const isAdmin = isAdministrador(autorMensagem);
        const contato = await message.getContact();
        const nome = contato.pushname || contato.name || 'Você';

        let resposta = `🔍 *VERIFICAÇÃO DE ADMINISTRADOR*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        resposta += `👤 Nome: ${nome}\n`;
        resposta += `📱 ID: ${autorMensagem}\n`;
        resposta += `👑 Admin: ${isAdmin ? '✅ SIM' : '❌ NÃO'}\n\n`;

        if (autorMensagem.includes('@lid')) {
            resposta += `ℹ️ Seu ID é do tipo @lid\n`;
            if (MAPEAMENTO_IDS[autorMensagem]) {
                resposta += `🔄 Mapeado para: ${MAPEAMENTO_IDS[autorMensagem]}\n`;
            } else {
                resposta += `⚠️ Não há mapeamento @lid para seu ID\n`;
            }
        }

        await message.reply(resposta);
        return true;
    }

    const isAdmin = isAdministrador(autorMensagem);
    if (!isAdmin) return false;

    // Comandos administrativos rápidos
    if (comando === '.ia') {
        const statusIA = ia.getStatusDetalhado();
        await message.reply(statusIA);
        return true;
    }

    if (comando === '.queue') {
        const stats = messageQueue.getStats();
        await message.reply(`📊 *QUEUE STATUS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n🔄 Fila: ${stats.queueSize}\n⚡ Ativos: ${stats.activeJobs}\n🎯 Processando: ${stats.processing ? 'SIM' : 'NÃO'}`);
        return true;
    }

    if (comando === '.memory') {
        const stats = memoryManager.getStats();
        const memStats = `📊 *MEMORY STATUS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n💾 Memória: ${stats.memory.total}MB\n🗄️ Cache Transações: ${stats.cacheTransacoes}\n👥 Códigos Ref: ${stats.codigosReferencia}\n🎯 Clientes Ref: ${stats.referenciasClientes}\n💰 Bônus: ${stats.bonusSaldos}\n⏳ Pagamentos Pendentes: ${stats.pagamentosPendentes}`;
        await message.reply(memStats);
        return true;
    }

    if (comando === '.pool') {
        let poolStatus = `🔗 *AXIOS STATUS (SIMPLIFICADO)*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        poolStatus += `✅ Axios simplificado ativo\n`;
        poolStatus += `⚡ Timeout: 30s\n`;
        poolStatus += `🔄 Max redirects: 3\n`;
        poolStatus += `📊 Pool complexo removido (seguindo bot1)`;

        await message.reply(poolStatus);
        return true;
    }

    if (comando === '.performance') {
        const queueStats = messageQueue.getStats();
        const usage = process.memoryUsage();
        const memTotal = Math.round(usage.rss / 1024 / 1024);

        let perfStatus = `⚡ *PERFORMANCE STATUS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        perfStatus += `🔒 Admin Cache: ${adminCache.size} entradas\n`;
        perfStatus += `📤 Message Queue: ${queueStats.queueSize} fila, ${queueStats.activeJobs} ativos\n`;
        perfStatus += `💾 Memória: ${memTotal}MB\n`;
        perfStatus += `🔇 Modo Silencioso: ${SILENT_MODE ? 'ATIVO' : 'INATIVO'}\n`;
        perfStatus += `🔗 Conexões: Axios simplificado (bot1 pattern)`;

        await message.reply(perfStatus);
        return true;
    }

    return false; // Comando não foi processado aqui
}

async function handlePurchaseCommands(message) {
    const body = message.body.toLowerCase().trim();

    // Comandos de compra que precisam ir para fila
    if (body.includes('comprar') || body.includes('mb') || body.includes('gb') ||
        body.startsWith('.') || body.includes('referencia') || body.includes('bonus')) {
        return true; // Deve ser processado na fila
    }

    return false;
}

async function processMessage(message) {
    try {
        const isPrivado = !message.from.endsWith('@g.us');
        const autorMensagem = message.author || message.from;
        const isAdmin = isAdministrador(autorMensagem);

        // DEBUG DETALHADO DA MENSAGEM
        if (message.body.startsWith('.addcomando') || message.body.startsWith('.comandos') || message.body.startsWith('.delcomando')) {
            smartLog(LOG_LEVEL.DEBUG, `🔍 DEBUG MENSAGEM ADMIN:`);
            console.log(`   📱 message.from: ${message.from}`);
            console.log(`   👤 message.author: ${message.author}`);
            console.log(`   🆔 autorMensagem: ${autorMensagem}`);
            
            try {
                const contact = await message.getContact();
                console.log(`   📞 Contact info:`, {
                    id: contact.id._serialized,
                    number: contact.number,
                    pushname: contact.pushname,
                    name: contact.name,
                    isMyContact: contact.isMyContact
                });
            } catch (err) {
                console.log(`   ⚠️ Erro ao obter contato: ${err.message}`);
            }
        }
        
        smartLog(LOG_LEVEL.DEBUG, `🔍 Debug: Verificando admin para ${autorMensagem}, resultado: ${isAdmin}`);

        // === COMANDOS ADMINISTRATIVOS ===
        smartLog(LOG_LEVEL.DEBUG, `🔍 Debug final: isAdmin = ${isAdmin}`);

        if (isAdmin) {
            const comando = message.body.toLowerCase().trim();

            if (comando === '.ia') {
                const statusIA = ia.getStatusDetalhado();
                await message.reply(statusIA);
                console.log(`🧠 Comando .ia executado`);
                return;
            }

            // === COMANDO DEBUG MENSAGENS DE SISTEMA ===
            if (comando === '.debug') {
                try {
                    const chat = await client.getChatById(message.from);
                    const mensagens = await chat.fetchMessages({ limit: 20 });

                    let debugInfo = `🔍 *DEBUG MENSAGENS (últimas 20)*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                    mensagens.forEach((msg, index) => {
                        const timestamp = new Date(msg.timestamp * 1000).toLocaleString();
                        debugInfo += `${index + 1}. *Tipo:* ${msg.type}\n`;
                        debugInfo += `   *Timestamp:* ${timestamp}\n`;
                        debugInfo += `   *Author:* ${msg.author || 'Sistema'}\n`;
                        debugInfo += `   *Body:* "${msg.body || 'N/A'}"\n\n`;
                    });

                    await message.reply(debugInfo);
                    console.log(`🔍 Comando .debug executado`);
                } catch (error) {
                    await message.reply(`❌ Erro no debug: ${error.message}`);
                }
                return;
            }

            if (comando === '.retry') {
                const pendenciasAtivas = Object.values(pagamentosPendentes);
                let statusRetry = `🔄 *STATUS RETRY SILENCIOSO*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                if (pendenciasAtivas.length === 0) {
                    statusRetry += `✅ Nenhum pagamento pendente\n`;
                    statusRetry += `⏹️ Timer: ${timerRetryPagamentos ? 'ATIVO' : 'PARADO'}\n`;
                } else {
                    statusRetry += `⏳ Pagamentos pendentes: ${pendenciasAtivas.length}\n\n`;

                    pendenciasAtivas.forEach((pendencia, index) => {
                        const tempoRestante = Math.max(0, Math.floor((pendencia.expira - Date.now()) / 60000));
                        const tempoDecorrido = Math.floor((Date.now() - pendencia.timestamp) / 60000);

                        statusRetry += `${index + 1}. ${pendencia.referencia}\n`;
                        statusRetry += `   💰 Valor: ${pendencia.valorComprovante}MT\n`;
                        statusRetry += `   🔄 Tentativas: ${pendencia.tentativas}/${MAX_RETRY_ATTEMPTS}\n`;
                        statusRetry += `   ⏰ Há ${tempoDecorrido}min (${tempoRestante}min restantes)\n\n`;
                    });

                    statusRetry += `🔄 Timer: ${timerRetryPagamentos ? 'ATIVO' : 'PARADO'}\n`;
                    statusRetry += `⏱️ Próxima verificação: ${RETRY_INTERVAL/1000}s\n`;
                }

                await message.reply(statusRetry);
                console.log(`🔄 Comando .retry executado`);
                return;
            }

            // === COMANDO CANCELAR REFERÊNCIA AUTOMÁTICA ===
            if (comando.startsWith('.cancelar ')) {
                const codigo = comando.replace('.cancelar ', '').trim().toUpperCase();

                if (!codigo) {
                    await message.reply('❌ Use: .cancelar CODIGO\nExemplo: .cancelar ABC123');
                    return;
                }

                // Verificar se o código existe
                const clienteId = codigosReferencia[codigo];
                if (!clienteId) {
                    await message.reply(`❌ Código de referência *${codigo}* não encontrado.`);
                    return;
                }

                const referencia = referenciasClientes[clienteId];
                if (!referencia) {
                    await message.reply(`❌ Dados da referência *${codigo}* não encontrados.`);
                    return;
                }

                // Verificar se quem está cancelando é o convidador
                const autorMensagem = message.author || message.from;
                if (referencia.convidadoPor !== autorMensagem) {
                    await message.reply(`❌ Apenas *${referencia.nomeConvidador}* pode cancelar esta referência.`);
                    return;
                }

                // Verificar se é uma referência automática
                const metodosAutomaticos = ['AUTO_INTELIGENTE', 'AUTO_ANALISE_MENSAGENS'];
                if (!metodosAutomaticos.includes(referencia.metodoDeteccao)) {
                    await message.reply(`❌ Apenas referências criadas automaticamente podem ser canceladas.\nPara referências manuais, contacte o administrador.`);
                    return;
                }

                // Verificar se já teve atividade (compras)
                if (referencia.comprasRealizadas > 0) {
                    await message.reply(`❌ Não é possível cancelar - cliente já realizou ${referencia.comprasRealizadas} compra(s).\nContacte o administrador se necessário.`);
                    return;
                }

                // Cancelar a referência
                delete referenciasClientes[clienteId];
                delete codigosReferencia[codigo];

                const mensagemCancelamento = `✅ *REFERÊNCIA CANCELADA*

🎯 **Código:** ${codigo}
👤 **Cliente:** ${referencia.nomeConvidado}
📅 **Cancelado em:** ${new Date().toLocaleDateString('pt-PT')}

💡 A referência foi removida do sistema.`;

                await message.reply(mensagemCancelamento);
                console.log(`🗑️ Referência automática cancelada: ${codigo} por ${referencia.nomeConvidador}`);
                return;
            }

            if (comando === '.stats') {
                let stats = `📊 *ESTATÍSTICAS*\n⚠ NB: Válido apenas para Vodacom━━━━━━━━\n\n`;
                
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

            if (comando === '.bonus_stats') {
                let stats = `🎁 *ESTATÍSTICAS DO SISTEMA DE REFERÊNCIAS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                // Estatísticas gerais
                const totalCodigos = Object.keys(codigosReferencia).length;
                const totalReferencias = Object.keys(referenciasClientes).length;
                const totalUsuariosComBonus = Object.keys(bonusSaldos).length;
                const totalSaques = Object.keys(pedidosSaque).length;
                
                stats += `📊 **RESUMO GERAL:**\n`;
                stats += `   • Códigos gerados: ${totalCodigos}\n`;
                stats += `   • Referências ativas: ${totalReferencias}\n`;
                stats += `   • Usuários com bônus: ${totalUsuariosComBonus}\n`;
                stats += `   • Saques solicitados: ${totalSaques}\n\n`;
                
                // Top convidadores
                const topConvidadores = Object.values(bonusSaldos)
                    .map(dados => ({
                        saldo: dados.saldo,
                        referencias: Object.keys(dados.detalhesReferencias || {}).length,
                        dados: dados
                    }))
                    .sort((a, b) => b.saldo - a.saldo)
                    .slice(0, 5);
                
                if (topConvidadores.length > 0) {
                    stats += `🏆 **TOP 5 CONVIDADORES:**\n`;
                    topConvidadores.forEach((item, index) => {
                        const saldoGB = (item.saldo / 1024).toFixed(2);
                        stats += `   ${index + 1}. ${item.saldo}MB (${saldoGB}GB) - ${item.referencias} referências\n`;
                    });
                    stats += `\n`;
                }
                
                // Estatísticas de compras
                let totalComprasBonus = 0;
                let totalBonusDistribuido = 0;
                
                Object.values(bonusSaldos).forEach(saldo => {
                    if (saldo.detalhesReferencias) {
                        Object.values(saldo.detalhesReferencias).forEach(ref => {
                            totalComprasBonus += ref.compras || 0;
                            totalBonusDistribuido += ref.bonusGanho || 0;
                        });
                    }
                });
                
                stats += `💰 **BÔNUS DISTRIBUÍDOS:**\n`;
                stats += `   • Total de compras que geraram bônus: ${totalComprasBonus}\n`;
                stats += `   • Total de MB distribuídos: ${totalBonusDistribuido}MB\n`;
                stats += `   • Equivalente em GB: ${(totalBonusDistribuido / 1024).toFixed(2)}GB\n\n`;
                
                // Saques pendentes
                const saquesPendentes = Object.values(pedidosSaque).filter(p => p.status === 'pendente');
                if (saquesPendentes.length > 0) {
                    stats += `⏳ **SAQUES PENDENTES:** ${saquesPendentes.length}\n`;
                    const totalPendente = saquesPendentes.reduce((sum, p) => sum + p.quantidade, 0);
                    stats += `   • Valor total: ${totalPendente}MB (${(totalPendente/1024).toFixed(2)}GB)\n\n`;
                }
                
                stats += `📈 **SISTEMA DE REFERÊNCIAS ATIVO E FUNCIONANDO!**`;
                
                await message.reply(stats);
                return;
            }

            // === COMANDOS DO SISTEMA DE PACOTES ===
            if (sistemaPacotes) {

                // .pacote DIAS REF NUMERO - Criar pacote
                if (comando.startsWith('.pacote ')) {
                    try {
                        console.log(`🔧 DEBUG: Comando .pacote detectado!`);
                        console.log(`🔧 DEBUG: sistemaPacotes = ${sistemaPacotes ? 'INICIALIZADO' : 'NULL'}`);
                        console.log(`🔧 DEBUG: SISTEMA_PACOTES_ENABLED = ${process.env.SISTEMA_PACOTES_ENABLED}`);

                        if (!sistemaPacotes) {
                            await message.reply(`❌ *SISTEMA DE PACOTES DESABILITADO*\n\nO sistema de pacotes automáticos não está ativo neste servidor.\n\nVerifique as configurações de ambiente.`);
                            return;
                        }

                        const partes = message.body.trim().split(' ');

                        if (partes.length < 4) {
                            await message.reply(`❌ *USO INCORRETO*\n\n✅ **Formato correto:**\n*.pacote DIAS REF NUMERO*\n\n📝 **Exemplos:**\n• *.pacote 3 ABC123 845123456*\n• *.pacote 30 XYZ789 847654321*\n\n📦 **Tipos disponíveis:**\n• 3 - Pacote de 3 dias (300MB)\n• 5 - Pacote de 5 dias (500MB)\n• 15 - Pacote de 15 dias (1.5GB)\n• 30 - Pacote de 30 dias (3GB)`);
                            return;
                        }

                        const [, diasPacote, referencia, numero] = partes;
                        const grupoId = message.from;

                        console.log(`📦 COMANDO PACOTE: Dias=${diasPacote}, Ref=${referencia}, Numero=${numero}`);

                        const resultado = await sistemaPacotes.processarComprovante(referencia, numero, grupoId, diasPacote);

                        if (resultado.sucesso) {
                            await message.reply(resultado.mensagem);
                        } else {
                            await message.reply(`❌ **ERRO AO CRIAR PACOTE**\n\n⚠️ ${resultado.erro}\n\n💡 **Verificar:**\n• Dias válidos (3, 5, 15, 30)\n• Referência não está duplicada`);
                        }
                    } catch (error) {
                        console.error('❌ Erro no comando .pacote:', error);
                        await message.reply(`❌ **ERRO INTERNO**\n\n⚠️ Não foi possível processar o pacote\n\n📝 Erro: ${error.message}`);
                    }
                    return;
                }
                
                // .pacotes_ativos - Listar clientes com pacotes ativos (do grupo atual)
                if (comando === '.pacotes_ativos') {
                    const lista = sistemaPacotes.listarClientesAtivos(message.from);
                    await message.reply(lista);
                    return;
                }
                
                // .pacotes_stats - Estatísticas do sistema de pacotes
                if (comando === '.pacotes_stats') {
                    const stats = sistemaPacotes.obterEstatisticas();
                    await message.reply(stats);
                    return;
                }

                // .pacotes_todos - Listar pacotes de TODOS os grupos (apenas admins globais)
                if (comando === '.pacotes_todos') {
                    if (!isAdministrador(autorMensagem)) {
                        await message.reply('❌ *Acesso negado!* Apenas administradores globais podem ver pacotes de todos os grupos.');
                        return;
                    }
                    const lista = sistemaPacotes.listarClientesAtivos(null); // null = todos os grupos
                    await message.reply(lista);
                    return;
                }
                
                // .cancelar_pacote NUMERO REF - Cancelar pacote
                if (comando.startsWith('.cancelar_pacote ')) {
                    const partes = message.body.trim().split(' ');
                    
                    if (partes.length < 3) {
                        await message.reply(`❌ *USO INCORRETO*\n\n✅ **Formato correto:**\n*.cancelar_pacote NUMERO REFERENCIA*\n\n📝 **Exemplo:**\n• *.cancelar_pacote 845123456 ABC123*`);
                        return;
                    }
                    
                    const [, numero, referencia] = partes;
                    const resultado = sistemaPacotes.cancelarPacote(numero, referencia);
                    await message.reply(resultado);
                    return;
                }

                // .validade NUMERO - Verificar validade do pacote (comando para CLIENTES)
                if (comando.startsWith('.validade ')) {
                    const partes = message.body.trim().split(' ');
                    
                    if (partes.length < 2) {
                        await message.reply(`❌ *USO INCORRETO*\n\n✅ **Formato correto:**\n*.validade NUMERO*\n\n📝 **Exemplo:**\n• *.validade 845123456*\n\n💡 Digite seu número para verificar a validade do seu pacote de 100MB diários.`);
                        return;
                    }
                    
                    const numero = partes[1];
                    const resultado = sistemaPacotes.verificarValidadePacote(numero);
                    
                    await message.reply(resultado);
                    return;
                }
                
                // .sistema_pacotes - Status do sistema
                if (comando === '.sistema_pacotes') {
                    const status = sistemaPacotes.getStatus();
                    let resposta = `📦 *STATUS DO SISTEMA DE PACOTES*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                    resposta += `🟢 **Status:** ${status.ativo ? 'ATIVO' : 'INATIVO'}\n`;
                    resposta += `👥 **Clientes ativos:** ${status.clientesAtivos}\n`;
                    resposta += `⏱️ **Verificação:** ${status.intervalVerificacao/60000} min\n`;
                    resposta += `📦 **Tipos disponíveis:** ${status.tiposPacotes.join(', ')}\n`;
                    resposta += `📊 **Histórico:** ${status.historicoSize} registros\n\n`;
                    resposta += `🔧 **Comandos Administrativos:**\n`;
                    resposta += `• *.pacote DIAS REF NUMERO* - Criar pacote\n`;
                    resposta += `• *.pacotes_ativos* - Listar ativos\n`;
                    resposta += `• *.pacotes_stats* - Estatísticas\n`;
                    resposta += `• *.cancelar_pacote NUMERO REF* - Cancelar\n\n`;
                    resposta += `👤 **Comando para Clientes:**\n`;
                    resposta += `• *.validade NUMERO* - Verificar validade do pacote\n\n`;
                    resposta += `⚡ *Sistema funcionando automaticamente!*`;
                    
                    await message.reply(resposta);
                    return;
                }
            }

            // === COMANDOS DO SISTEMA DE COMPRAS ===
            if (sistemaCompras) {
                // .ranking - Mostrar ranking completo de compradores
                if (comando === '.ranking') {
                    try {
                        const ranking = await sistemaCompras.obterRankingCompletoGrupo(message.from);

                        console.log(`📊 DEBUG RANKING: Recebeu ${ranking ? ranking.length : 0} itens`);
                        if (ranking && ranking.length > 0) {
                            console.log(`📊 DEBUG RANKING: Primeiro item:`, JSON.stringify(ranking[0]));
                        }

                        if (!ranking || ranking.length === 0) {
                            await message.reply(`📊 *RANKING DE COMPRADORES*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n🚫 Nenhum comprador registrado no grupo.`);
                            return;
                        }
                        
                        let mensagem = `📊 *RANKING DE COMPRADORES*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                        let mentions = [];
                        
                        for (let i = 0; i < ranking.length; i++) {
                            const item = ranking[i];

                            // Validar se o item tem dados válidos
                            if (!item || !item.numero) {
                                console.log(`⚠️ Item inválido no ranking na posição ${i}`);
                                continue;
                            }

                            // COPIAR EXATAMENTE A LÓGICA DAS BOAS-VINDAS - SEM CONVERSÃO
                            const participantId = item.numero; // Usar número exatamente como está salvo

                            // Obter informações do contato
                            try {
                                const contact = await client.getContactById(participantId);

                                // Prioridade: nome salvo > nome do perfil > número
                                const nomeExibicao = contact.name || contact.pushname || item.numero;

                                const posicaoEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${item.posicao}º`;
                                const megasFormatados = (item.megas || 0) >= 1024 ?
                                    `${((item.megas || 0)/1024).toFixed(1)}GB` : `${item.megas || 0}MB`;

                                // Formatar o ID para menção (remover @c.us ou @lid)
                                const mentionId = String(participantId).replace('@c.us', '').replace('@lid', '');

                                // Usar exatamente o mesmo padrão das boas-vindas
                                mensagem += `${posicaoEmoji} @${mentionId}\n`;
                                mensagem += `   💾 ${megasFormatados} no grupo (${item.compras || 0}x)\n`;
                                mensagem += `   📊 Total: ${(item.megasTotal || 0) >= 1024 ? ((item.megasTotal || 0)/1024).toFixed(1)+'GB' : (item.megasTotal || 0)+'MB'}\n\n`;

                                mentions.push(participantId);
                            } catch (error) {
                                // Se não conseguir obter o contato, usar apenas o número com padrão das boas-vindas
                                const posicaoEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${item.posicao}º`;
                                const megasFormatados = (item.megas || 0) >= 1024 ?
                                    `${((item.megas || 0)/1024).toFixed(1)}GB` : `${item.megas || 0}MB`;

                                // Formatar o ID para menção (remover @c.us ou @lid)
                                const mentionId = String(participantId).replace('@c.us', '').replace('@lid', '');

                                // Usar exatamente o mesmo padrão das boas-vindas
                                mensagem += `${posicaoEmoji} @${mentionId}\n`;
                                mensagem += `   💾 ${megasFormatados} no grupo (${item.compras || 0}x)\n`;
                                mensagem += `   📊 Total: ${(item.megasTotal || 0) >= 1024 ? ((item.megasTotal || 0)/1024).toFixed(1)+'GB' : (item.megasTotal || 0)+'MB'}\n\n`;

                                mentions.push(participantId);
                            }
                        }

                        mensagem += `🏆 *Total de compradores no grupo: ${ranking.length}*`;

                        // Validar e limpar array de mentions (aceitar @lid e @c.us)
                        const mentionsValidos = mentions.filter(id => {
                            if (!id || typeof id !== 'string') {
                                console.log(`⚠️ Mention inválido (não é string):`, id);
                                return false;
                            }
                            // Aceitar @lid e @c.us, mas não IDs genéricos do sistema
                            if (id.startsWith('SAQUE_BONUS_')) {
                                console.log(`⚠️ Mention ignorado (sistema):`, id);
                                return false;
                            }
                            if (!id.includes('@lid') && !id.includes('@c.us')) {
                                console.log(`⚠️ Mention sem @lid ou @c.us:`, id);
                                return false;
                            }
                            return true;
                        });

                        console.log(`📊 Ranking: ${ranking.length} compradores, ${mentionsValidos.length} mentions válidos`);

                        await client.sendMessage(message.from, mensagem, { mentions: mentionsValidos });
                        return;
                    } catch (error) {
                        console.error('❌ Erro ao obter ranking:', error);
                        await message.reply(`❌ *ERRO*\n\nNão foi possível obter o ranking de compradores.\n\n⚠️ Erro: ${error.message}`);
                        return;
                    }
                }
                
                // .inativos - Mostrar membros do grupo que NUNCA compraram
                if (comando === '.inativos') {
                    try {
                        // Obter todos os participantes do grupo
                        const chat = await message.getChat();
                        const participantes = chat.participants || [];

                        console.log(`👥 Total de participantes no grupo: ${participantes.length}`);

                        // Obter lista de compradores do grupo
                        const compradores = await sistemaCompras.obterRankingCompletoGrupo(message.from);

                        // Criar Set com todos os IDs possíveis dos compradores
                        const compradoresIdsSet = new Set();

                        for (const comprador of compradores) {
                            const idComprador = comprador.numero;
                            compradoresIdsSet.add(idComprador);

                            // Tentar obter o contato para descobrir outros IDs
                            try {
                                const contact = await client.getContactById(idComprador);

                                // Adicionar o ID principal do contato
                                if (contact.id && contact.id._serialized) {
                                    compradoresIdsSet.add(contact.id._serialized);
                                }

                                // Adicionar número do usuário se disponível
                                if (contact.id && contact.id.user) {
                                    compradoresIdsSet.add(`${contact.id.user}@c.us`);
                                }

                                // Se o ID salvo é @lid, verificar mapeamento
                                if (idComprador.includes('@lid') && MAPEAMENTO_IDS[idComprador]) {
                                    compradoresIdsSet.add(MAPEAMENTO_IDS[idComprador]);
                                }
                            } catch (error) {
                                // Continuar mesmo se não conseguir obter o contato
                                console.log(`⚠️ Não foi possível obter contato para: ${idComprador}`);
                            }
                        }

                        console.log(`🛒 Total de compradores: ${compradores.length}`);
                        console.log(`🛒 Total de IDs únicos (todos os formatos): ${compradoresIdsSet.size}`);

                        // Obter IDs dos participantes
                        const participantesIds = participantes.map(p => p.id._serialized);
                        console.log(`👥 Total de participantes: ${participantesIds.length}`);

                        // Filtrar participantes que nunca compraram
                        const nuncaCompraram = [];

                        for (const participanteId of participantesIds) {
                            // Verificar se está no Set de compradores
                            if (compradoresIdsSet.has(participanteId)) {
                                console.log(`✅ ${participanteId} É COMPRADOR - filtrado`);
                                continue;
                            }

                            // Verificar também pelo número base
                            const numeroBase = participanteId.split('@')[0];
                            const temNumeroBase = Array.from(compradoresIdsSet).some(id => id.startsWith(numeroBase));

                            if (temNumeroBase) {
                                console.log(`✅ ${participanteId} (base: ${numeroBase}) É COMPRADOR - filtrado`);
                                continue;
                            }

                            // Não é comprador
                            nuncaCompraram.push(participanteId);
                        }

                        console.log(`🚫 Membros que nunca compraram: ${nuncaCompraram.length}`);

                        if (nuncaCompraram.length === 0) {
                            await message.reply(`🎉 *MEMBROS QUE NUNCA COMPRARAM*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Todos os membros do grupo já fizeram pelo menos uma compra!`);
                            return;
                        }

                        let mensagem = `🚫 *MEMBROS QUE NUNCA COMPRARAM*\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
                        mensagem += `📊 Total: ${nuncaCompraram.length} membros\n\n`;
                        let mentions = [];

                        // Limitar a 50 membros para não sobrecarregar a mensagem
                        const limite = Math.min(nuncaCompraram.length, 50);

                        for (let i = 0; i < limite; i++) {
                            const participantId = nuncaCompraram[i];

                            // Validar ID
                            if (!participantId || participantId.startsWith('SAQUE_BONUS_')) {
                                continue;
                            }

                            try {
                                const contact = await client.getContactById(participantId);
                                const nomeExibicao = contact.name || contact.pushname || 'Membro';

                                // Formatar o ID para menção (remover @c.us ou @lid)
                                const mentionId = String(participantId).replace('@c.us', '').replace('@lid', '');

                                mensagem += `${i + 1}. @${mentionId}\n`;

                                mentions.push(participantId);
                            } catch (error) {
                                // Se não conseguir obter o contato, adicionar mesmo assim
                                const mentionId = String(participantId).replace('@c.us', '').replace('@lid', '');
                                mensagem += `${i + 1}. @${mentionId}\n`;
                                mentions.push(participantId);
                            }
                        }

                        if (nuncaCompraram.length > limite) {
                            mensagem += `\n... e mais ${nuncaCompraram.length - limite} membros\n`;
                        }

                        mensagem += `\n🚫 *Total: ${nuncaCompraram.length} membros que nunca compraram*`;

                        // Validar mentions (aceitar @lid e @c.us)
                        const mentionsValidos = mentions.filter(id => {
                            if (!id || typeof id !== 'string') return false;
                            if (id.startsWith('SAQUE_BONUS_')) return false;
                            if (!id.includes('@lid') && !id.includes('@c.us')) return false;
                            return true;
                        });

                        console.log(`🚫 Inativos: ${nuncaCompraram.length} membros, ${mentionsValidos.length} mentions válidos`);

                        await client.sendMessage(message.from, mensagem, { mentions: mentionsValidos });
                        return;
                    } catch (error) {
                        console.error('❌ Erro ao obter inativos:', error);
                        await message.reply(`❌ *ERRO*\n\nNão foi possível obter a lista de inativos.\n\n⚠️ Erro: ${error.message}`);
                        return;
                    }
                }

                // .detetives - Mostrar membros que NUNCA mandaram mensagem no grupo
                if (comando === '.detetives') {
                    try {
                        // Obter todos os participantes do grupo
                        const chat = await message.getChat();
                        const participantes = chat.participants || [];

                        console.log(`👥 Total de participantes no grupo: ${participantes.length}`);

                        // REMOVIDO: Sistema de registro de mensagens (movido para outro bot)

                        // Filtrar participantes que nunca mandaram mensagem
                        // NOTA: Agora retorna todos os participantes (sem filtro de mensagens)
                        const nuncaMandaram = [];

                        // REMOVIDO: Verificação de registro de mensagens
                        // Comando .espioes agora está desabilitado (sistema movido para outro bot)

                        await message.reply(`⚠️ *COMANDO DESABILITADO*\n\nO sistema de registro de mensagens foi movido para outro bot.\nUse o bot de monitoramento para esta funcionalidade.`);
                        return;

                        console.log(`🕵️ Membros que nunca mandaram mensagem: ${nuncaMandaram.length}`);

                        if (nuncaMandaram.length === 0) {
                            await message.reply(`🎉 *MEMBROS ESPIÕES*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n✅ Não há espiões! Todos os membros do grupo já mandaram pelo menos uma mensagem!`);
                            return;
                        }

                        let mensagem = `🕵️ *MEMBROS ESPIÕES*\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
                        mensagem += `📊 Total: ${nuncaMandaram.length} membros\n\n`;
                        let mentions = [];

                        // Limitar a 50 membros para não sobrecarregar a mensagem
                        const limite = Math.min(nuncaMandaram.length, 50);

                        for (let i = 0; i < limite; i++) {
                            const participanteId = nuncaMandaram[i];

                            // Validar ID
                            if (!participanteId || participanteId.startsWith('SAQUE_BONUS_')) {
                                continue;
                            }

                            try {
                                const contact = await client.getContactById(participanteId);
                                const nomeExibicao = contact.name || contact.pushname || 'Membro';

                                // Formatar o ID para menção (remover @c.us ou @lid)
                                const mentionId = String(participanteId).replace('@c.us', '').replace('@lid', '');

                                mensagem += `${i + 1}. @${mentionId}\n`;

                                mentions.push(participanteId);
                            } catch (error) {
                                // Se não conseguir obter o contato, adicionar mesmo assim
                                const mentionId = String(participanteId).replace('@c.us', '').replace('@lid', '');
                                mensagem += `${i + 1}. @${mentionId}\n`;
                                mentions.push(participanteId);
                            }
                        }

                        if (nuncaMandaram.length > limite) {
                            mensagem += `\n... e mais ${nuncaMandaram.length - limite} espiões\n`;
                        }

                        mensagem += `\n🕵️ *Total de espiões: ${nuncaMandaram.length}*`;

                        // Validar mentions (aceitar @lid e @c.us)
                        const mentionsValidos = mentions.filter(id => {
                            if (!id || typeof id !== 'string') return false;
                            if (id.startsWith('SAQUE_BONUS_')) return false;
                            if (!id.includes('@lid') && !id.includes('@c.us')) return false;
                            return true;
                        });

                        console.log(`🕵️ Detetives: ${nuncaMandaram.length} membros, ${mentionsValidos.length} mentions válidos`);

                        await client.sendMessage(message.from, mensagem, { mentions: mentionsValidos });
                        return;
                    } catch (error) {
                        console.error('❌ Erro ao obter detetives:', error);
                        await message.reply(`❌ *ERRO*\n\nNão foi possível obter a lista de detetives.\n\n⚠️ Erro: ${error.message}`);
                        return;
                    }
                }

                // .semcompra - Mostrar usuários que nunca compraram
                if (comando === '.semcompra') {
                    try {
                        const semCompra = await sistemaCompras.obterSemCompra();
                        
                        if (semCompra.length === 0) {
                            await message.reply(`🆕 *USUÁRIOS SEM COMPRAS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n✨ Todos os usuários registrados já fizeram pelo menos uma compra!`);
                            return;
                        }
                        
                        let mensagem = `🆕 *USUÁRIOS SEM COMPRAS*\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
                        mensagem += `👥 Nunca fizeram compras\n\n`;
                        let mentions = [];
                        
                        for (let i = 0; i < Math.min(semCompra.length, 30); i++) {
                            const item = semCompra[i];
                            // COPIAR EXATAMENTE A LÓGICA DAS BOAS-VINDAS - SEM CONVERSÃO
                            const participantId = item.numero; // Usar número exatamente como está salvo

                            // Obter informações do contato
                            try {
                                const contact = await client.getContactById(participantId);
                                
                                // Prioridade: nome salvo > nome do perfil > número
                                const nomeExibicao = contact.name || contact.pushname || item.numero;
                                const numeroLimpo = contact.id.user; // Número sem @ e sem +
                                
                                mensagem += `👤 @${participantId.replace('@c.us', '')}\n`;
                                mensagem += `   📅 Registrado: ${new Date(item.primeiraCompra).toLocaleDateString('pt-BR')}\n`;
                                mensagem += `   💰 Compras: ${item.totalCompras} (${item.megasTotal}MB)\n\n`;
                                
                                mentions.push(participantId);
                            } catch (error) {
                                // Se não conseguir obter o contato, usar apenas o número
                                mensagem += `👤 @${participantId.replace('@c.us', '')}\n`;
                                mensagem += `   📅 Registrado: ${new Date(item.primeiraCompra).toLocaleDateString('pt-BR')}\n`;
                                mensagem += `   💰 Compras: ${item.totalCompras} (${item.megasTotal}MB)\n\n`;
                                
                                mentions.push(participantId);
                            }
                        }
                        
                        if (semCompra.length > 30) {
                            mensagem += `... e mais ${semCompra.length - 30} usuários sem compras\n\n`;
                        }
                        
                        mensagem += `🆕 *Total sem compras: ${semCompra.length}*\n\n`;
                        mensagem += `💡 *Dica:* Considere campanhas de incentivo para estes usuários!`;
                        
                        await client.sendMessage(message.from, mensagem, { mentions: mentions });
                        return;
                    } catch (error) {
                        console.error('❌ Erro ao obter sem compra:', error);
                        await message.reply(`❌ *ERRO*\n\nNão foi possível obter a lista de usuários sem compras.\n\n⚠️ Erro: ${error.message}`);
                        return;
                    }
                }

                // .resetranking - Comando removido (ranking diário/semanal desabilitado)
                if (comando === '.resetranking') {
                    await message.reply(`❌ *COMANDO DESABILITADO*\n\nO sistema de ranking diário/semanal foi removido.\nApenas o ranking geral está ativo.`);
                    return;
                }

                // .mapear LID NUMERO - Mapear manualmente LID para número real
                if (comando.startsWith('.mapear ')) {
                    const partes = message.body.trim().split(' ');
                    if (partes.length !== 3) {
                        await message.reply(`❌ *USO INCORRETO*\n\n✅ **Formato:**\n*.mapear LID_CODE NUMERO*\n\n📝 **Exemplo:**\n*.mapear 76991768342659@lid 258870818180@c.us*\n\n💡 **Dica:** Use este comando quando souber que um LID específico corresponde a um número real.`);
                        return;
                    }

                    const [, lidCode, numeroReal] = partes;

                    // Validar formatos
                    if (!lidCode.endsWith('@lid')) {
                        await message.reply(`❌ *LID INVÁLIDO*\n\nO LID deve terminar com '@lid'\n\n📝 **Exemplo:** 76991768342659@lid`);
                        return;
                    }

                    if (!numeroReal.endsWith('@c.us')) {
                        await message.reply(`❌ *NÚMERO INVÁLIDO*\n\nO número deve terminar com '@c.us'\n\n📝 **Exemplo:** 258870818180@c.us`);
                        return;
                    }

                    const sucesso = await adicionarMapeamento(lidCode, numeroReal);
                    if (sucesso) {
                        await message.reply(`✅ *MAPEAMENTO ADICIONADO*\n\n🔗 ${lidCode}\n↓\n📱 ${numeroReal}\n\n💾 Salvo no arquivo de mapeamentos.`);
                    } else {
                        await message.reply(`⚠️ *MAPEAMENTO JÁ EXISTE*\n\nEste LID já está mapeado para:\n📱 ${MAPEAMENTO_IDS[lidCode] || 'Desconhecido'}`);
                    }
                    return;
                }

                // .mapeamentos - Listar todos os mapeamentos conhecidos
                if (comando === '.mapeamentos') {
                    let mensagem = `📋 *MAPEAMENTOS LID CONHECIDOS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                    const mapeamentosValidos = Object.entries(MAPEAMENTO_IDS).filter(([lid, numero]) => numero && numero !== null);

                    if (mapeamentosValidos.length === 0) {
                        mensagem += `❌ Nenhum mapeamento encontrado`;
                    } else {
                        mapeamentosValidos.forEach(([lid, numero], index) => {
                            mensagem += `${index + 1}. ${lid}\n   → ${numero}\n\n`;
                        });
                        mensagem += `📊 *Total: ${mapeamentosValidos.length} mapeamentos*`;
                    }

                    await message.reply(mensagem);
                    return;
                }

                // .testreferencia - Testar sistema de referência automática (ADMIN APENAS)
                if (comando === '.testreferencia') {
                    if (!isAdmin) {
                        await message.reply('❌ Apenas administradores podem usar este comando!');
                        return;
                    }

                    try {
                        await message.reply('🧪 *TESTE DE REFERÊNCIA AUTOMÁTICA*\n\nTestando criação de referência automática...');

                        // Simular criação de referência automática usando o admin como convidador e um ID fictício como convidado
                        const convidadorTest = autorMensagem;
                        const convidadoTest = '258000000000@c.us'; // ID fictício para teste
                        const grupoTest = message.from;

                        setTimeout(async () => {
                            try {
                                const resultado = await criarReferenciaAutomatica(convidadorTest, convidadoTest, grupoTest);

                                if (resultado) {
                                    await message.reply(
                                        `✅ *TESTE DE REFERÊNCIA - SUCESSO!*\n\n` +
                                        `🎯 **Resultado do teste:**\n` +
                                        `👤 Convidador: ${await obterNomeContato(convidadorTest)}\n` +
                                        `👥 Convidado: ${convidadoTest.replace('@c.us', '')}\n` +
                                        `🔗 Código gerado: ${resultado.codigo}\n` +
                                        `🤖 Sistema: ${resultado.automatico ? 'Automático' : 'Manual'}\n\n` +
                                        `📋 **Status:**\n` +
                                        `✅ Referência criada com sucesso\n` +
                                        `✅ Notificação enviada\n` +
                                        `✅ Dados salvos\n\n` +
                                        `💡 *Sistema de referência automática está funcionando!*`
                                    );
                                } else {
                                    await message.reply(
                                        `❌ *TESTE DE REFERÊNCIA - FALHOU!*\n\n` +
                                        `⚠️ A criação de referência automática falhou.\n` +
                                        `📝 Verifique os logs para mais detalhes.`
                                    );
                                }
                            } catch (error) {
                                await message.reply(
                                    `❌ *ERRO NO TESTE DE REFERÊNCIA*\n\n` +
                                    `🚨 Erro: ${error.message}\n\n` +
                                    `📝 Verifique a implementação da função criarReferenciaAutomatica`
                                );
                            }
                        }, 1000);

                    } catch (error) {
                        console.error('❌ Erro no comando .testreferencia:', error);
                        await message.reply(`❌ *ERRO*\n\nNão foi possível executar o teste\n\n📝 Erro: ${error.message}`);
                    }
                    return;
                }
                
                // .bonus NUMERO QUANTIDADE - Dar bônus manual (ADMIN APENAS)
                if (comando.startsWith('.bonus ')) {
                    try {
                        console.log(`\n🎁 === COMANDO .BONUS DETECTADO ===`);
                        console.log(`🔍 Autor: ${autorMensagem}`);
                        console.log(`📝 Comando completo: "${comando}"`);

                        // Verificar permissão de admin
                        const admins = ['258861645968', '258123456789', '258852118624', '23450974470333', '251032533737504', '203109674577958']; // Lista de admins
                        const numeroAdmin = autorMensagem.replace('@c.us', '').replace('@lid', '');
                        console.log(`🔑 Número admin processado: ${numeroAdmin}`);
                        console.log(`📋 Admins permitidos: ${admins.join(', ')}`);

                        if (!admins.includes(numeroAdmin)) {
                            console.log(`❌ Admin NÃO autorizado`);
                            return; // Falha silenciosa para segurança
                        }

                        console.log(`✅ Admin AUTORIZADO`);

                        const parametros = comando.split(' ');
                        console.log(`📊 Parâmetros: ${JSON.stringify(parametros)}`);

                        if (parametros.length < 3) {
                            console.log(`❌ Parâmetros insuficientes (${parametros.length})`);
                            await message.reply(`❌ *FORMATO INCORRETO*\n\n✅ Use: *.bonus @usuario QUANTIDADE* ou *.bonus NUMERO QUANTIDADE*\nExemplos:\n• *.bonus @258123456789 500MB*\n• *.bonus 258123456789 500MB*`);
                            return;
                        }

                        let numeroDestino = parametros[1];
                        const quantidadeStr = parametros[2].toUpperCase();
                        console.log(`📱 Número destino: ${numeroDestino}`);
                        console.log(`💎 Quantidade: ${quantidadeStr}`);

                        // USAR O MESMO PADRÃO DO SISTEMA DE COMPRAS
                        // O sistema de compras usa: message.author (ID que vem direto do WhatsApp)
                        // Para bônus admin, usamos: mentionedIds[0] (ID da pessoa mencionada)
                        let idParaSalvar = null;

                        // Verificar se é menção ou número direto
                        if (numeroDestino.startsWith('@')) {
                            console.log(`🔍 Detectada menção (@)`);
                            if (message.mentionedIds && message.mentionedIds.length > 0) {
                                const mencaoId = message.mentionedIds[0];
                                console.log(`📱 ID da menção inicial: ${mencaoId}`);

                                // BUSCAR O PARTICIPANTE REAL NO GRUPO
                                try {
                                    const chat = await message.getChat();
                                    if (chat.isGroup && chat.participants) {
                                        console.log(`🔍 Buscando participante real no grupo (${chat.participants.length} participantes)...`);

                                        // Extrair últimos 9 dígitos do número mencionado
                                        const numeroMencionado = mencaoId.replace('@c.us', '').replace('@lid', '');
                                        const ultimos9 = numeroMencionado.slice(-9);
                                        console.log(`🔍 Buscando por últimos 9 dígitos: ${ultimos9}`);

                                        // Buscar TODOS os participantes que correspondem (pode haver @c.us E @lid)
                                        const participantesEncontrados = [];
                                        chat.participants.forEach(p => {
                                            const pNumero = p.id._serialized.replace('@c.us', '').replace('@lid', '');
                                            const pUltimos9 = pNumero.slice(-9);
                                            if (pUltimos9 === ultimos9 && ultimos9.length === 9) {
                                                participantesEncontrados.push(p.id._serialized);
                                            }
                                        });

                                        console.log(`📋 Participantes encontrados (${participantesEncontrados.length}): ${participantesEncontrados.join(', ')}`);

                                        if (participantesEncontrados.length > 0) {
                                            // Priorizar @lid sobre @c.us (ID real do WhatsApp)
                                            const idLid = participantesEncontrados.find(id => id.includes('@lid'));
                                            idParaSalvar = idLid || participantesEncontrados[0];
                                            console.log(`✅ USANDO ID: ${idParaSalvar} ${idLid ? '(@lid prioritário)' : ''}`);
                                        } else {
                                            idParaSalvar = mencaoId;
                                            console.log(`⚠️ Participante não encontrado, usando ID da menção: ${idParaSalvar}`);
                                        }
                                    } else {
                                        idParaSalvar = mencaoId;
                                        console.log(`⚠️ Não é grupo, usando ID da menção: ${idParaSalvar}`);
                                    }
                                } catch (error) {
                                    console.error(`❌ Erro ao buscar participante:`, error);
                                    idParaSalvar = mencaoId;
                                    console.log(`⚠️ Usando ID da menção por erro: ${idParaSalvar}`);
                                }

                                // Extrair número para exibição
                                numeroDestino = idParaSalvar.replace('@c.us', '').replace('@lid', '');
                                console.log(`📱 Número extraído para exibição: ${numeroDestino}`);
                            } else {
                                console.log(`⚠️ Nenhuma menção encontrada, usando número após @`);
                                const numeroMencao = numeroDestino.substring(1);
                                numeroDestino = numeroMencao;
                            }
                        }

                        // Se não veio de menção, validar o número
                        if (!idParaSalvar) {
                            console.log(`🔎 Validando número: "${numeroDestino}"`);
                            console.log(`   - Tem 9 dígitos? ${/^\d{9}$/.test(numeroDestino)}`);
                            console.log(`   - Tem 12 dígitos? ${/^\d{12}$/.test(numeroDestino)}`);
                            console.log(`   - É ID @lid? ${/^\d+$/.test(numeroDestino)}`);

                            // Validar número - aceitar 9 dígitos, 12 dígitos ou IDs @lid (15 dígitos)
                            if (!/^\d{9,15}$/.test(numeroDestino)) {
                                console.log(`❌ Número INVÁLIDO: ${numeroDestino}`);
                                await message.reply(`❌ *NÚMERO INVÁLIDO*\n\n✅ Use formato:\n• *.bonus @usuario 500MB* (com menção)\n• *.bonus @848715208 500MB* (9 dígitos)\n• *.bonus @258848715208 500MB* (12 dígitos)\n• *.bonus 848715208 500MB* (número direto)`);
                                return;
                            }

                            console.log(`✅ Número válido (${numeroDestino.length} dígitos)`);

                            // Converter para formato completo se necessário (apenas para números de 9 dígitos)
                            if (numeroDestino.length === 9) {
                                numeroDestino = '258' + numeroDestino;
                                console.log(`🔄 Convertido para 12 dígitos: ${numeroDestino}`);
                            }

                            // Criar ID @c.us para números digitados
                            idParaSalvar = `${numeroDestino}@c.us`;
                        }

                        // Converter quantidade para MB
                        let quantidadeMB;
                        if (quantidadeStr.endsWith('GB')) {
                            const gb = parseFloat(quantidadeStr.replace('GB', ''));
                            console.log(`💎 Convertendo GB: ${gb}GB = ${gb * 1024}MB`);
                            if (isNaN(gb) || gb <= 0) {
                                console.log(`❌ GB inválido: ${quantidadeStr}`);
                                await message.reply(`❌ Quantidade inválida: *${quantidadeStr}*`);
                                return;
                            }
                            quantidadeMB = Math.round(gb * 1024);
                        } else if (quantidadeStr.endsWith('MB')) {
                            quantidadeMB = parseInt(quantidadeStr.replace('MB', ''));
                            console.log(`💎 Usando MB diretamente: ${quantidadeMB}MB`);
                            if (isNaN(quantidadeMB) || quantidadeMB <= 0) {
                                console.log(`❌ MB inválido: ${quantidadeStr}`);
                                await message.reply(`❌ Quantidade inválida: *${quantidadeStr}*`);
                                return;
                            }
                        } else {
                            console.log(`❌ Formato desconhecido: ${quantidadeStr}`);
                            await message.reply(`❌ *FORMATO INVÁLIDO*\n\n✅ Use: MB ou GB\nExemplos: 500MB, 1.5GB, 2GB`);
                            return;
                        }

                        console.log(`✅ Quantidade final: ${quantidadeMB}MB`);
                        console.log(`🎯 ID para salvar bônus: ${idParaSalvar}`);

                        // Inicializar saldo se necessário (IGUAL ao sistema de bônus de referência)
                        if (!bonusSaldos[idParaSalvar]) {
                            console.log(`🆕 Criando novo registro de bônus para ${idParaSalvar}`);
                            bonusSaldos[idParaSalvar] = {
                                saldo: 0,
                                detalhesReferencias: {},
                                historicoSaques: [],
                                totalReferencias: 0,
                                bonusAdmin: []
                            };
                        } else {
                            console.log(`✅ Registro existente encontrado para ${idParaSalvar} (saldo: ${bonusSaldos[idParaSalvar].saldo}MB)`);
                        }

                        // === ADICIONAR BÔNUS USANDO SISTEMABONUS (IGUAL AO SISTEMA DE REFERÊNCIA) ===
                        console.log(`💰 Adicionando ${quantidadeMB}MB ao beneficiário...`);

                        let saldoAnterior = 0;
                        let novoSaldo = 0;

                        // Usar sistemaBonus se disponível (método robusto)
                        if (sistemaBonus) {
                            console.log(`✅ Usando SistemaBonus (método robusto)`);

                            await sistemaBonus.atualizarSaldo(idParaSalvar, (saldoObj) => {
                                saldoAnterior = saldoObj.saldo;
                                saldoObj.saldo += quantidadeMB;

                                // Registrar histórico de bônus admin
                                if (!saldoObj.bonusAdmin) {
                                    saldoObj.bonusAdmin = [];
                                }

                                saldoObj.bonusAdmin.push({
                                    quantidade: quantidadeMB,
                                    data: new Date().toISOString(),
                                    admin: autorMensagem,
                                    motivo: 'Bônus administrativo'
                                });

                                novoSaldo = saldoObj.saldo;
                            });

                            console.log(`💰 Saldo atualizado: ${saldoAnterior}MB → ${novoSaldo}MB (+${quantidadeMB}MB)`);
                            console.log(`✅ Dados salvos automaticamente pelo SistemaBonus`);

                        } else {
                            // Fallback para método antigo
                            console.log(`⚠️ SistemaBonus não disponível, usando método antigo`);

                            saldoAnterior = bonusSaldos[idParaSalvar].saldo;
                            bonusSaldos[idParaSalvar].saldo += quantidadeMB;

                            // Registrar histórico de bônus admin
                            if (!bonusSaldos[idParaSalvar].bonusAdmin) {
                                bonusSaldos[idParaSalvar].bonusAdmin = [];
                            }

                            bonusSaldos[idParaSalvar].bonusAdmin.push({
                                quantidade: quantidadeMB,
                                data: new Date().toISOString(),
                                admin: autorMensagem,
                                motivo: 'Bônus administrativo'
                            });

                            novoSaldo = bonusSaldos[idParaSalvar].saldo;

                            console.log(`💰 Saldo atualizado: ${saldoAnterior}MB → ${novoSaldo}MB (+${quantidadeMB}MB)`);

                            // Salvar dados IMEDIATAMENTE
                            console.log(`💾 Salvando dados de bônus imediatamente...`);
                            try {
                                await salvarDadosReferencia();
                                console.log(`✅ Dados de bônus salvos com sucesso!`);
                            } catch (erroSalvamento) {
                                console.error(`❌ ERRO CRÍTICO ao salvar bônus:`, erroSalvamento);
                            }
                        }

                        const quantidadeFormatada = quantidadeMB >= 1024 ? `${(quantidadeMB/1024).toFixed(2)}GB` : `${quantidadeMB}MB`;
                        const novoSaldoFormatado = novoSaldo >= 1024 ? `${(novoSaldo/1024).toFixed(2)}GB` : `${novoSaldo}MB`;

                        console.log(`🎁 ADMIN BONUS CONCEDIDO: ${autorMensagem} → ${numeroDestino} (+${quantidadeFormatada})`);

                        // Notificar o usuário que recebeu o bônus (USANDO EXATAMENTE O PADRÃO DAS CONFIRMAÇÕES DE COMPRA)
                        const mensagemBonus = `🎁 *BÔNUS ADMINISTRATIVO!*\n\n` +
                            `💎 @NOME_PLACEHOLDER, recebeste *${quantidadeFormatada}* de bônus!\n\n` +
                            `👨‍💼 *Ofertado por:* Administrador\n` +
                            `💰 *Novo saldo:* ${novoSaldoFormatado}\n\n` +
                            `${novoSaldo >= 1024 ? '🚀 *Já podes sacar!* Use: *.sacar*' : '💡 *Continua a acumular para sacar!*'}`;

                        try {
                            // SEGUIR PADRÃO DO RANKING (linha 3635-3657)
                            const mentionId = String(idParaSalvar).replace('@c.us', '').replace('@lid', '');

                            // Mensagem usa @mentionId (apenas o número)
                            const mensagemFinal = mensagemBonus.replace('@NOME_PLACEHOLDER', `@${mentionId}`);

                            // Array mentions recebe o ID completo (com @c.us ou @lid)
                            await client.sendMessage(message.from, mensagemFinal, {
                                mentions: [idParaSalvar]
                            });
                        } catch (notificationError) {
                            console.error('❌ Erro ao enviar notificação de bônus admin:', notificationError);
                            // Fallback: enviar sem menção
                            const mentionId = numeroDestino;
                            const mensagemFallback = mensagemBonus.replace('@NOME_PLACEHOLDER', mentionId);
                            await message.reply(mensagemFallback);
                        }

                        await message.reply(
                            `✅ *BÔNUS ADMINISTRATIVO CONCEDIDO*\n\n` +
                            `👤 Beneficiário: ${numeroDestino}\n` +
                            `🎁 Bônus concedido: ${quantidadeFormatada}\n` +
                            `💰 Novo saldo: ${novoSaldoFormatado}\n` +
                            `👑 Concedido por: Administrador\n` +
                            `📅 Data: ${new Date().toLocaleString('pt-BR')}\n\n` +
                            `💡 *O usuário foi notificado automaticamente*`
                        );
                        
                        return;
                    } catch (error) {
                        console.error('❌ Erro no comando .bonus:', error);
                        await message.reply(`❌ *ERRO INTERNO*\n\n⚠️ Não foi possível conceder bônus\n\n📝 Erro: ${error.message}`);
                        return;
                    }
                }

                // === COMANDOS DE RELATÓRIOS ANTIGOS (DESATIVADOS - USAR NOVOS ABAIXO) ===

                // COMANDOS ANTIGOS REMOVIDOS - Usar novos comandos mais abaixo (linha ~4405+)
                // Os novos comandos suportam:
                // - Preço de revenda personalizado por grupo (16-18 MT/GB)
                // - Cálculo automático de lucro
                // - Configuração mais simples (sem precisar do GRUPO_ID)
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

            if (comando === '.test_vision') {
                const visionStatus = ia.googleVisionEnabled;
                let resposta = `🔍 *TESTE GOOGLE VISION*\n⚠ NB: Válido apenas para Vodacom━━━━━━━━\n\n`;
                
                if (visionStatus) {
                    resposta += `✅ **Google Vision: ATIVO**\n`;
                    resposta += `🔧 **Configuração:**\n`;
                    resposta += `   • Timeout: ${ia.googleVisionTimeout}ms\n`;
                    resposta += `   • Fallback: GPT-4 Vision\n\n`;
                    resposta += `📝 **Para testar:**\n`;
                    resposta += `1. Envie uma imagem de comprovante\n`;
                    resposta += `2. Verifique nos logs qual método foi usado\n`;
                    resposta += `3. Google Vision será tentado primeiro\n`;
                    resposta += `4. GPT-4 Vision como fallback\n\n`;
                    resposta += `📊 **Vantagens do método híbrido:**\n`;
                    resposta += `   ✅ Maior precisão OCR\n`;
                    resposta += `   ✅ Menor custo\n`;
                    resposta += `   ✅ Mais rápido\n`;
                    resposta += `   ✅ Sistema redundante`;
                } else {
                    resposta += `❌ **Google Vision: DESABILITADO**\n\n`;
                    resposta += `🔧 **Para ativar:**\n`;
                    resposta += `1. Configure GOOGLE_APPLICATION_CREDENTIALS no .env\n`;
                    resposta += `2. Ou configure GOOGLE_VISION_API_KEY\n`;
                    resposta += `3. Defina GOOGLE_VISION_ENABLED=true\n\n`;
                    resposta += `🧠 **Atualmente usando:**\n`;
                    resposta += `   • GPT-4 Vision apenas\n`;
                    resposta += `   • Funciona normalmente\n`;
                    resposta += `   • Sem redundância`;
                }
                
                await message.reply(resposta);
                return;
            }

            // === COMANDO PARA ADICIONAR COMANDOS CUSTOMIZADOS ===
            if (message.body.startsWith('.addcomando ')) {
                const comandoParsado = parsearComandoCustomizado(message.body);
                
                if (!comandoParsado) {
                    await message.reply(`❌ *Sintaxe incorreta!*\n\n✅ *Sintaxe correta:*\n\`.addcomando NomeComando(Sua resposta aqui)\`\n\n📝 *Exemplo:*\n\`.addcomando horario(Funcionamos de 8h às 18h)\`\n\n⚠️ *Importante:*\n• Nome sem espaços\n• Resposta entre parênteses\n• Pode usar quebras de linha`);
                    return;
                }
                
                try {
                    await adicionarComandoCustomizado(
                        message.from,
                        comandoParsado.nome,
                        comandoParsado.resposta,
                        message.author || message.from
                    );
                    
                    await message.reply(`✅ *Comando criado com sucesso!*\n\n🔧 **Comando:** \`${comandoParsado.nome}\`\n📝 **Resposta:** ${comandoParsado.resposta.substring(0, 100)}${comandoParsado.resposta.length > 100 ? '...' : ''}\n\n💡 **Para usar:** Digite apenas \`${comandoParsado.nome}\``);
                    console.log(`✅ Admin ${message.author || message.from} criou comando '${comandoParsado.nome}' no grupo ${message.from}`);
                } catch (error) {
                    await message.reply(`❌ **Erro ao criar comando**\n\nTente novamente ou contacte o desenvolvedor.`);
                    console.error('❌ Erro ao adicionar comando customizado:', error);
                }
                return;
            }

            // === COMANDO PARA LISTAR COMANDOS CUSTOMIZADOS ===
            if (comando === '.comandos') {
                const grupoId = message.from;
                const comandosGrupo = comandosCustomizados[grupoId];
                
                if (!comandosGrupo || Object.keys(comandosGrupo).length === 0) {
                    await message.reply('📋 *Nenhum comando customizado criado ainda*\n\n💡 **Para criar:** `.addcomando nome(resposta)`');
                    return;
                }
                
                let listaComandos = '📋 *COMANDOS CUSTOMIZADOS*\n⚠ NB: Válido apenas para Vodacom━━━━━━━━\n\n';
                
                Object.keys(comandosGrupo).forEach(nome => {
                    const cmd = comandosGrupo[nome];
                    const preview = cmd.resposta.length > 50 ? 
                        cmd.resposta.substring(0, 50) + '...' : 
                        cmd.resposta;
                    
                    listaComandos += `🔧 **${nome}**\n📝 ${preview}\n\n`;
                });
                
                listaComandos += `📊 **Total:** ${Object.keys(comandosGrupo).length} comando(s)`;
                
                await message.reply(listaComandos);
                return;
            }

            // === COMANDO PARA REMOVER COMANDOS CUSTOMIZADOS ===
            if (message.body.startsWith('.delcomando ')) {
                const nomeComando = message.body.replace('.delcomando ', '').trim().toLowerCase();
                
                if (!nomeComando) {
                    await message.reply(`❌ *Nome do comando é obrigatório!*\n\n✅ *Sintaxe:* \`.delcomando nomecomando\`\n\n📝 *Para ver comandos:* \`.comandos\``);
                    return;
                }
                
                try {
                    const removido = await removerComandoCustomizado(message.from, nomeComando);
                    
                    if (removido) {
                        await message.reply(`✅ *Comando removido!*\n\n🗑️ **Comando:** \`${nomeComando}\`\n\n📝 **Para ver restantes:** \`.comandos\``);
                        console.log(`✅ Admin ${message.author || message.from} removeu comando '${nomeComando}' do grupo ${message.from}`);
                    } else {
                        await message.reply(`❌ *Comando não encontrado!*\n\n🔍 **Comando:** \`${nomeComando}\`\n📝 **Ver comandos:** \`.comandos\``);
                    }
                } catch (error) {
                    await message.reply(`❌ **Erro ao remover comando**\n\nTente novamente ou contacte o desenvolvedor.`);
                    console.error('❌ Erro ao remover comando customizado:', error);
                }
                return;
            }

            // === COMANDO PARA CONFIGURAR NÚMERO DE RELATÓRIO ===
            if (message.body.startsWith('.config-relatorio ')) {
                console.log(`\n======= DEBUG CONFIG-RELATORIO =======`);
                console.log(`📥 Mensagem completa: "${message.body}"`);

                const textoSemComando = message.body.replace('.config-relatorio ', '');
                console.log(`📝 Texto sem comando: "${textoSemComando}"`);

                const args = textoSemComando.trim().split(/\s+/);
                console.log(`📋 Args array:`, args);
                console.log(`📋 Args[0]: "${args[0]}" (type: ${typeof args[0]})`);
                console.log(`📋 Args[1]: "${args[1]}" (type: ${typeof args[1]})`);

                const numeroInput = args[0];
                const precoRevenda = args[1] ? parseFloat(args[1]) : 16;

                console.log(`\n🔍 VALIDAÇÕES:`);
                console.log(`  numeroInput = "${numeroInput}"`);
                console.log(`  length = ${numeroInput ? numeroInput.length : 0}`);
                console.log(`  precoRevenda = ${precoRevenda}`);
                console.log(`  startsWith('258') = ${numeroInput ? numeroInput.startsWith('258') : false}`);

                // Validar formato do número (deve começar com 258 e ter 12 dígitos)
                const numeroLimpo = numeroInput ? numeroInput.trim() : '';
                const apenasDigitos = /^\d+$/.test(numeroLimpo);

                console.log(`  numeroLimpo = "${numeroLimpo}"`);
                console.log(`  apenasDigitos = ${apenasDigitos}`);
                console.log(`  numeroLimpo.length = ${numeroLimpo.length}`);
                console.log(`  numeroLimpo.startsWith('258') = ${numeroLimpo.startsWith('258')}`);

                console.log(`\n✅ CHECKS:`);
                console.log(`  !numeroLimpo = ${!numeroLimpo}`);
                console.log(`  !numeroLimpo.startsWith('258') = ${!numeroLimpo.startsWith('258')}`);
                console.log(`  numeroLimpo.length !== 12 = ${numeroLimpo.length !== 12}`);
                console.log(`  !apenasDigitos = ${!apenasDigitos}`);
                console.log(`======================================\n`);

                if (!numeroLimpo || !numeroLimpo.startsWith('258') || numeroLimpo.length !== 12 || !apenasDigitos) {
                    let motivoErro = [];
                    if (!numeroLimpo) motivoErro.push('número vazio');
                    if (numeroLimpo && !numeroLimpo.startsWith('258')) motivoErro.push('não começa com 258');
                    if (numeroLimpo && numeroLimpo.length !== 12) motivoErro.push(`tem ${numeroLimpo.length} dígitos (esperado: 12)`);
                    if (numeroLimpo && !apenasDigitos) motivoErro.push('contém caracteres não numéricos');

                    await message.reply(`❌ *Número inválido!*\n\n🔍 *Motivo:* ${motivoErro.join(', ')}\n\n✅ *Formato correto:* 258XXXXXXXXX PREÇO\n\n📝 *Exemplos:*\n\`.config-relatorio 258847123456 17\`\n\`.config-relatorio 258852118624 16\`\n\n📊 *Debug info:*\nSeu número: "${numeroInput}"\nLength: ${numeroInput ? numeroInput.length : 0}\nApenas dígitos: ${apenasDigitos}`);
                    return;
                }

                // Validar preço de revenda (16-18 MT/GB)
                if (isNaN(precoRevenda) || precoRevenda < 16 || precoRevenda > 18) {
                    await message.reply(`❌ *Preço inválido!*\n\n✅ O preço deve estar entre 16 e 18 MT/GB\n\n📝 *Exemplo:* \`.config-relatorio 258847123456 17\`\n\n📊 *Seu preço:* ${precoRevenda}`);
                    return;
                }

                // Validar se o número existe no mapeamento
                if (!global.sistemaRelatorios.validarNumeroNoMapeamento(numeroLimpo, MAPEAMENTO_IDS)) {
                    await message.reply(`❌ *Número não encontrado no mapeamento!*\n\n⚠️ O número ${numeroLimpo} não está registrado no sistema.\n\n💡 Apenas números mapeados podem receber relatórios.`);
                    return;
                }

                try {
                    const chat = await message.getChat();
                    const grupoNome = chat.name || 'Grupo';
                    const grupoId = message.from;

                    await global.sistemaRelatorios.configurarNumeroRelatorio(grupoId, numeroLimpo, grupoNome, precoRevenda);

                    await message.reply(`✅ *Relatórios configurados com sucesso!*\n\n📊 **Grupo:** ${grupoNome}\n📱 **Número:** ${numeroInput}\n\n🕙 Relatórios diários serão enviados às 22:00\n\n💬 Uma mensagem de confirmação com detalhes foi enviada para o número configurado.`);

                    console.log(`✅ Admin configurou relatórios do grupo ${grupoNome} para ${numeroInput} - Preço: ${precoRevenda} MT/GB`);
                } catch (error) {
                    await message.reply(`❌ *Erro ao configurar relatórios*\n\nTente novamente ou contacte o desenvolvedor.`);
                    console.error('❌ Erro ao configurar relatórios:', error);
                }
                return;
            }

            // === COMANDO PARA LISTAR CONFIGURAÇÕES DE RELATÓRIO ===
            if (comando === '.list-relatorios') {
                const grupoId = message.from;
                const numeroConfigurado = global.sistemaRelatorios.numerosRelatorio[grupoId];

                if (!numeroConfigurado) {
                    await message.reply(`📋 *Relatórios não configurados*\n\n⚠️ Este grupo ainda não tem número configurado para receber relatórios.\n\n💡 **Para configurar:**\n\`.config-relatorio 258XXXXXXXXX PREÇO\`\n\n📝 **Exemplo:**\n\`.config-relatorio 258847123456 17\``);
                    return;
                }

                const chat = await message.getChat();
                const grupoNome = chat.name || 'Grupo';
                const precoRevenda = global.sistemaRelatorios.precosRevenda[grupoId] || 16;
                const lucro = precoRevenda - 12;

                let resposta = `📊 *CONFIGURAÇÃO DE RELATÓRIOS*\n\n`;
                resposta += `👥 **Grupo:** ${grupoNome}\n`;
                resposta += `📱 **Número:** ${numeroConfigurado}\n`;
                resposta += `🕙 **Horário:** Diário às 22:00\n\n`;
                resposta += `💸 **PREÇOS:**\n`;
                resposta += `• Compra: 12 MT/GB\n`;
                resposta += `• Revenda: ${precoRevenda} MT/GB\n`;
                resposta += `• Lucro: ${lucro} MT/GB\n\n`;
                resposta += `✅ Relatórios ativos`;

                await message.reply(resposta);
                return;
            }

            // === COMANDO PARA REMOVER CONFIGURAÇÃO DE RELATÓRIO ===
            if (comando === '.remove-relatorio') {
                const grupoId = message.from;
                const numeroConfigurado = global.sistemaRelatorios.numerosRelatorio[grupoId];

                if (!numeroConfigurado) {
                    await message.reply(`❌ *Nenhuma configuração encontrada*\n\n⚠️ Este grupo não possui relatórios configurados.`);
                    return;
                }

                try {
                    await global.sistemaRelatorios.removerNumeroRelatorio(grupoId);

                    await message.reply(`✅ *Configuração removida!*\n\n📱 **Número removido:** ${numeroConfigurado}\n\n⚠️ Este grupo não receberá mais relatórios automáticos.`);

                    console.log(`✅ Admin removeu configuração de relatórios do grupo ${grupoId}`);
                } catch (error) {
                    await message.reply(`❌ *Erro ao remover configuração*\n\nTente novamente ou contacte o desenvolvedor.`);
                    console.error('❌ Erro ao remover configuração de relatórios:', error);
                }
                return;
            }

            // === COMANDO PARA TESTAR RELATÓRIO ===
            if (comando === '.test-relatorio') {
                const grupoId = message.from;
                const numeroConfigurado = global.sistemaRelatorios.numerosRelatorio[grupoId];

                if (!numeroConfigurado) {
                    await message.reply(`❌ *Relatórios não configurados*\n\n⚠️ Configure primeiro usando:\n\`.config-relatorio 258XXXXXXXXX\``);
                    return;
                }

                try {
                    await message.reply(`🧪 *Gerando relatório de teste...*\n\n⏳ Aguarde alguns segundos...`);

                    const chat = await message.getChat();
                    const grupoNome = chat.name || 'Grupo';

                    await global.sistemaRelatorios.gerarRelatorioGrupo(grupoId, grupoNome);

                    await message.reply(`✅ *Relatório enviado!*\n\n📱 Verifique o número ${numeroConfigurado}`);

                    console.log(`✅ Admin solicitou teste de relatório para grupo ${grupoNome}`);
                } catch (error) {
                    await message.reply(`❌ *Erro ao gerar relatório*\n\n${error.message}`);
                    console.error('❌ Erro ao gerar relatório de teste:', error);
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
                let resposta = `📊 *STATUS DOS GRUPOS*\n⚠ NB: Válido apenas para Vodacom━━━━━━━━\n\n`;
                
                for (const [grupoId, config] of Object.entries(CONFIGURACAO_GRUPOS)) {
                    const dadosGrupo = Array.from(cacheTransacoes.values()).filter(d => d.grupo_id === grupoId);
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
                
                let resposta = `📊 *GOOGLE SHEETS STATUS*\n⚠ NB: Válido apenas para Vodacom━━━━━━━━\n\n`;
                resposta += `📈 Total enviado: ${dados.length}\n`;
                resposta += `📅 Hoje: ${hoje.length}\n`;
                resposta += `📊 Via Google Sheets: ${sheets}\n`;
                resposta += `📱 Via WhatsApp: ${whatsapp}\n\n`;
                // REMOVIDO: Fila de encaminhamento (sistema movido para outro bot)
                
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
                const antes = cacheTransacoes.size;

                // Remover transações do grupo específico
                for (const [key, value] of cacheTransacoes.entries()) {
                    if (value.grupo && value.grupo.toLowerCase().includes(nomeGrupo.toLowerCase())) {
                        cacheTransacoes.delete(key);
                    }
                }

                const removidos = antes - cacheTransacoes.size;
                await message.reply(`🗑️ *${removidos} registros do grupo "${nomeGrupo}" removidos!*`);
                return;
            }

            if (comando === '.clear_sheets') {
                cacheTransacoes.clear();
                await message.reply('🗑️ *Cache de transações limpo!*');
                return;
            }

            // === COMANDOS TASKER - SISTEMA DE PACOTES ===
            
            // DEBUG: Verificar status do sistema de pacotes
            if (comando === '.debug_pacotes') {
                let resposta = `🔧 *DEBUG SISTEMA PACOTES*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                resposta += `🔌 SISTEMA_PACOTES_ENABLED: ${process.env.SISTEMA_PACOTES_ENABLED}\n`;
                resposta += `📦 sistemaPacotes: ${sistemaPacotes ? 'INICIALIZADO' : 'NULL'}\n`;
                resposta += `👤 isAdminQualquer: ${isAdminQualquer}\n`;
                resposta += `📝 Comando original: "${message.body}"\n`;
                resposta += `🆔 Grupo ID: ${message.from}\n`;
                
                if (sistemaPacotes) {
                    resposta += `\n✅ Sistema de Pacotes está ATIVO e funcionando!`;
                } else {
                    resposta += `\n❌ Sistema de Pacotes está DESABILITADO ou falhou ao inicializar!`;
                }
                
                await message.reply(resposta);
                return;
            }
            
            if (comando === '.pacotes_tasker') {
                const dadosPacotes = obterDadosPacotesTasker();
                
                if (dadosPacotes.length === 0) {
                    await message.reply(`📦 *DADOS TASKER - PACOTES*\n\n❌ Nenhum cliente com pacote ativo para o Tasker.`);
                    return;
                }
                
                let resposta = `📦 *DADOS TASKER - PACOTES* (${dadosPacotes.length})\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                dadosPacotes.forEach((cliente, index) => {
                    const proximaRenovacao = new Date(cliente.proximaRenovacao);
                    resposta += `${index + 1}. **${cliente.numero}**\n`;
                    resposta += `   📋 Ref: ${cliente.referenciaOriginal}\n`;
                    resposta += `   📦 Tipo: ${cliente.tipoPacote}\n`;
                    resposta += `   📅 Dias restantes: ${cliente.diasRestantes}\n`;
                    resposta += `   ⏰ Próxima: ${proximaRenovacao.toLocaleString('pt-BR')}\n\n`;
                });
                
                resposta += `💡 *O Tasker pode acessar estes dados via função do bot para processar renovações automaticamente.*`;
                
                await message.reply(resposta);
                return;
            }
            
            if (comando === '.renovacoes_tasker') {
                const renovacoesPendentes = obterRenovacoesPendentesTasker();
                
                if (renovacoesPendentes.length === 0) {
                    await message.reply(`🔄 *RENOVAÇÕES TASKER*\n\n✅ Nenhuma renovação pendente nas próximas 6 horas.`);
                    return;
                }
                
                let resposta = `🔄 *RENOVAÇÕES TASKER* (${renovacoesPendentes.length})\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                
                renovacoesPendentes.forEach((cliente, index) => {
                    const proximaRenovacao = new Date(cliente.proximaRenovacao);
                    
                    resposta += `${index + 1}. **${cliente.numero}**\n`;
                    resposta += `   📋 Ref: ${cliente.referenciaOriginal}\n`;
                    resposta += `   📦 Tipo: ${cliente.tipoPacote}\n`;
                    resposta += `   📅 Dias restantes: ${cliente.diasRestantes}\n`;
                    resposta += `   ⏰ Próxima renovação: ${proximaRenovacao.toLocaleString('pt-BR')}\n\n`;
                });
                
                resposta += `💡 *Horários já calculados com 2h de antecipação em relação ao dia anterior.*`;
                
                await message.reply(resposta);
                return;
            }

            // === COMANDOS DO SISTEMA DE COMPRAS ===
            
            if (comando === '.compras_stats') {
                if (!sistemaCompras) {
                    await message.reply('❌ Sistema de compras não está ativo!');
                    return;
                }
                
                const estatisticas = await sistemaCompras.obterEstatisticas();
                
                let resposta = `🛒 *ESTATÍSTICAS DE COMPRAS*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                resposta += `📊 Total de compradores: ${estatisticas.totalCompradores}\n`;
                resposta += `📅 Compradores hoje: ${estatisticas.compradoresHoje}\n`;
                resposta += `⏳ Compras pendentes: ${estatisticas.comprasPendentes}\n`;
                resposta += `💾 Total de megas hoje: ${estatisticas.totalMegasHoje >= 1024 ? (estatisticas.totalMegasHoje/1024).toFixed(1) + ' GB' : estatisticas.totalMegasHoje + ' MB'}\n\n`;
                
                if (estatisticas.ranking.length > 0) {
                    resposta += `🏆 *TOP 5 RANKING HOJE:*\n`;
                    estatisticas.ranking.slice(0, 5).forEach((cliente, index) => {
                        const megasFormatados = cliente.megasHoje >= 1024 ? `${(cliente.megasHoje/1024).toFixed(1)} GB` : `${cliente.megasHoje} MB`;
                        resposta += `${index + 1}º ${cliente.numero} - ${megasFormatados} (${cliente.comprasHoje}x)\n`;
                    });
                }
                
                await message.reply(resposta);
                return;
            }
            
            
            if (comando.startsWith('.comprador ')) {
                if (!sistemaCompras) {
                    await message.reply('❌ Sistema de compras não está ativo!');
                    return;
                }
                
                const numero = comando.replace('.comprador ', '').trim();
                
                if (!/^\d{9}$/.test(numero)) {
                    await message.reply('❌ Use: *.comprador 849123456*');
                    return;
                }
                
                const cliente = sistemaCompras.historicoCompradores[numero];
                
                if (!cliente) {
                    await message.reply(`❌ Cliente *${numero}* não encontrado no sistema de compras.`);
                    return;
                }
                
                const posicao = await sistemaCompras.obterPosicaoCliente(numero);
                const megasHojeFormatados = cliente.megasHoje >= 1024 ? `${(cliente.megasHoje/1024).toFixed(1)} GB` : `${cliente.megasHoje} MB`;
                const megasTotalFormatados = cliente.megasTotal >= 1024 ? `${(cliente.megasTotal/1024).toFixed(1)} GB` : `${cliente.megasTotal} MB`;
                
                let resposta = `👤 *PERFIL DO COMPRADOR*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
                resposta += `📱 **Número:** ${numero}\n`;
                resposta += `🏆 **Posição hoje:** ${posicao.posicao}º lugar\n`;
                resposta += `📊 **Hoje:** ${megasHojeFormatados} (${cliente.comprasHoje} compras)\n`;
                resposta += `💎 **Total geral:** ${megasTotalFormatados} (${cliente.totalCompras} compras)\n`;
                resposta += `📅 **Primeira compra:** ${new Date(cliente.primeiraCompra).toLocaleDateString('pt-BR')}\n`;
                resposta += `⏰ **Última compra:** ${new Date(cliente.ultimaCompra).toLocaleDateString('pt-BR')}\n`;
                
                await message.reply(resposta);
                return;
            }

            // === NOVOS COMANDOS PARA DETECÇÃO DE GRUPOS ===
            if (comando === '.grupos') {
                try {
                    let resposta = `📋 *GRUPOS DETECTADOS*\n⚠ NB: Válido apenas para Vodacom━━━━━━━━\n\n`;
                    
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

        // === FUNÇÃO PARA DETECTAR INTENÇÃO DE .MEUCODIGO ===
        async function detectarIntencaoMeuCodigo(texto) {
            // Primeiro, verificação básica por padrões (sem IA - economia)
            const textoLimpo = texto.toLowerCase().trim();

            // Padrões mais comuns (com e sem espaços)
            const padroesDiretos = [
                // Versões sem espaço
                'meucodigo',
                'meucódigo',
                '.meucodigo',
                '.meucódigo',

                // Versões com espaço
                'meu codigo',
                'meu código',
                '.meu codigo',
                '.meu código',

                // Outras variações
                'meu codigo de referencia',
                'meu código de referência',
                'ver meu codigo',
                'ver meu código',
                'qual meu codigo',
                'qual meu código',
                'qual o meu codigo',
                'qual o meu código',
                'como ver meu codigo',
                'como ver meu código',
                'minha referencia',
                'minha referência',
                'codigo meu',
                'código meu',
                'codigo pessoal',
                'código pessoal',
                'meu referencia',
                'meu referência'
            ];

            // Verificação direta (mais rápido)
            for (const padrao of padroesDiretos) {
                if (textoLimpo.includes(padrao)) {
                    console.log(`🎯 DETECTADO: "${texto}" → padrão "${padrao}"`);
                    return true;
                }
            }

            // Detecção por IA desativada (função obterResposta não implementada)
            // A detecção por padrões acima já é suficiente
            return false;
        }

        // === DETECÇÃO INTELIGENTE DE .MEUCODIGO (QUALQUER FORMATO) ===
        if (message.type === 'chat' && await detectarIntencaoMeuCodigo(message.body)) {
            const remetente = message.author || message.from;
            let codigo = null;

            // Verificar se já tem código (buscar em TODOS os códigos)
            console.log(`🔍 Procurando código existente para: ${remetente}`);
            for (const [cod, dados] of Object.entries(codigosReferencia)) {
                if (dados.dono === remetente) {
                    codigo = cod;
                    console.log(`✅ Código existente encontrado: ${codigo}`);
                    break;
                }
            }

            // Se não tem, criar novo
            if (!codigo) {
                console.log(`📝 Criando NOVO código para: ${remetente}`);
                codigo = gerarCodigoReferencia(remetente);
                codigosReferencia[codigo] = {
                    dono: remetente,
                    nome: message._data.notifyName || 'N/A',
                    criado: new Date().toISOString(),
                    ativo: true
                };

                // CORRIGIDO: Salvar IMEDIATAMENTE (não agendar) para garantir persistência
                console.log(`💾 Salvando código ${codigo} IMEDIATAMENTE...`);
                await salvarDadosReferencia();
                console.log(`✅ Código ${codigo} salvo com sucesso!`);
            }

            await message.reply(
                `🎁 *SEU CÓDIGO DE REFERÊNCIA*\n\n` +
                `📋 Código: *${codigo}*\n\n` +
                `🎯 *Como usar:*\n` +
                `1. Convide amigos para o grupo\n` +
                `2. Peça para eles digitarem:\n` +
                `   *.convite ${codigo}*\n\n` +
                `💰 *Ganhe 200MB* a cada compra deles!\n` +
                `🎉 *Primeiras 5 compras* = 1GB cada\n\n` +
                `🚀 Sem limite de amigos que pode convidar!`
            );
            console.log(`🎁 Código de referência enviado: ${codigo} para ${remetente}`);
            return;
        }

        // === COMANDOS DE REFERÊNCIA E BÔNUS (TODOS USUÁRIOS) ===
        if (message.type === 'chat' && message.body.startsWith('.')) {
            const comando = message.body.toLowerCase().trim();
            const remetente = message.author || message.from;

            // === OUTROS COMANDOS COM PONTO ===

            // .convite CODIGO - Registrar referência
            if (comando.startsWith('.convite ')) {
                const codigo = comando.split(' ')[1]?.toUpperCase();
                
                if (!codigo) {
                    await message.reply('❌ Use: *.convite CODIGO*\nExemplo: *.convite AB12CD*');
                    return;
                }
                
                // Verificar se código existe
                if (!codigosReferencia[codigo]) {
                    await message.reply(`❌ Código *${codigo}* não encontrado!\n\n💡 Peça para quem te convidou verificar o código com *.meucodigo*`);
                    return;
                }
                
                // Verificar se já tem referência
                if (referenciasClientes[remetente]) {
                    await message.reply(`⚠️ Você já foi convidado por alguém!\n\nNão é possível usar outro código de referência.`);
                    return;
                }
                
                // Verificar se não está tentando usar próprio código
                if (codigosReferencia[codigo].dono === remetente) {
                    await message.reply('❌ Não podes usar teu próprio código de referência! 😅');
                    return;
                }

                // NOVA VALIDAÇÃO: Verificar se é elegível (entrou nos últimos 5 dias)
                if (!isElegivelParaCodigo(remetente, message.from)) {
                    await message.reply(
                        `⏳ *CÓDIGO EXPIRADO PARA SEU PERFIL*\n\n` +
                        `❌ Códigos de referência só funcionam para membros que entraram no grupo nos últimos 5 dias.\n\n` +
                        `🤔 *Por que isso acontece?*\n` +
                        `• Sistema anti-abuse\n` +
                        `• Incentiva convites genuínos\n` +
                        `• Protege economia do grupo\n\n` +
                        `💡 *Solução:* Você ainda pode gerar seu próprio código com *.meucodigo* e convidar outros!`
                    );
                    return;
                }
                
                // Registrar referência
                referenciasClientes[remetente] = {
                    convidadoPor: codigosReferencia[codigo].dono,
                    codigo: codigo,
                    dataRegistro: new Date().toISOString(),
                    comprasRealizadas: 0
                };

                const convidadorId = codigosReferencia[codigo].dono;
                const nomeConvidador = codigosReferencia[codigo].nome;

                // CORRIGIDO: Marcar código como usado
                codigosReferencia[codigo].usado = true;
                codigosReferencia[codigo].usadoPor = remetente;
                codigosReferencia[codigo].dataUso = new Date().toISOString();

                // CORRIGIDO: Inicializar saldo de bônus do convidador
                if (!bonusSaldos[convidadorId]) {
                    bonusSaldos[convidadorId] = {
                        saldo: 0,
                        detalhesReferencias: {},
                        historicoSaques: [],
                        totalReferencias: 0
                    };
                }
                bonusSaldos[convidadorId].totalReferencias++;

                // CORRIGIDO: Salvar IMEDIATAMENTE para garantir persistência
                console.log(`💾 Salvando uso do código ${codigo} IMEDIATAMENTE...`);
                await salvarDadosReferencia();

                // Salvar arquivo de membros se foi atualizado
                try {
                    await fs.writeFile(ARQUIVO_MEMBROS, JSON.stringify(membrosEntrada, null, 2));
                    console.log(`✅ Membros entrada salvos com sucesso!`);
                } catch (error) {
                    console.log('⚠️ Erro ao salvar membros entrada:', error.message);
                }
                
                // CORRIGIDO: Remover @lid e @c.us das menções
                const convidadorLimpo = convidadorId.replace('@c.us', '').replace('@lid', '');

                await client.sendMessage(message.from,
                    `✅ *CÓDIGO APLICADO COM SUCESSO!*\n\n` +
                    `🎉 @${convidadorLimpo} te convidou - registrado!\n\n` +
                    `💎 *Benefícios:*\n` +
                    `• Nas tuas próximas 5 compras, @${convidadorLimpo} ganha 200MB cada\n` +
                    `• Tu recebes teus megas normalmente\n` +
                    `• Ajudas um amigo a ganhar bônus!\n\n` +
                    `🚀 *Próximo passo:* Faz tua primeira compra!`, {
                    mentions: [convidadorId]
                });
                return;
            }

            // .bonus - Ver saldo de bônus
            if (comando === '.bonus' || comando === '.saldo') {
                console.log(`🔍 Buscando saldo para: ${remetente}`);
                const saldo = await buscarSaldoBonus(remetente);
                
                if (!saldo || saldo.saldo === 0) {
                    await message.reply(
                        `💰 *TEU SALDO DE BÔNUS*\n\n` +
                        `🎁 Total acumulado: *0MB*\n` +
                        `📊 Referências ativas: *0 pessoas*\n\n` +
                        `🚀 *Como ganhar bônus:*\n` +
                        `1. Gera teu código com *.meucodigo*\n` +
                        `2. Convida amigos para o grupo\n` +
                        `3. Eles usam *.convite TEUCODIGO*\n` +
                        `4. A cada compra deles, ganhas 200MB\n` +
                        `5. Com 1GB+ podes sacar com *.sacar*`
                    );
                    return;
                }
                
                const saldoGB = (saldo.saldo / 1024).toFixed(2);
                const podeSacar = saldo.saldo >= 1024;
                const referenciasAtivas = Object.keys(saldo.detalhesReferencias || {}).length;
                
                let detalhes = '';
                if (saldo.detalhesReferencias) {
                    Object.entries(saldo.detalhesReferencias).forEach(([cliente, dados]) => {
                        const nome = dados.nome || 'Cliente';
                        detalhes += `• ${nome}: ${dados.compras}/5 compras (${dados.bonusGanho}MB ganhos)\n`;
                    });
                }
                
                await message.reply(
                    `💰 *TEU SALDO DE BÔNUS*\n\n` +
                    `🎁 Total acumulado: *${saldo.saldo}MB* (${saldoGB}GB)\n` +
                    `📊 Referências ativas: *${referenciasAtivas} pessoas*\n` +
                    `💡 Mínimo para saque: 1GB (1024MB)\n\n` +
                    `${detalhes ? `👥 *Detalhes das referências:*\n${detalhes}\n` : ''}` +
                    `${podeSacar ? '🚀 *Pronto para sacar!*\nUse: *.sacar 1GB 845123456*' : '⏳ Incentiva teus convidados a comprar!'}`
                );
                return;
            }

            // .sacar QUANTIDADE NUMERO - Solicitar saque
            if (comando.startsWith('.sacar ')) {
                const partes = comando.split(' ');
                if (partes.length < 3) {
                    await message.reply(
                        `❌ *FORMATO INCORRETO*\n\n` +
                        `✅ Use: *.sacar QUANTIDADE NUMERO*\n\n` +
                        `📋 *Exemplos:*\n` +
                        `• *.sacar 1GB 845123456*\n` +
                        `• *.sacar 2048MB 847654321*\n` +
                        `• *.sacar 1.5GB 843210987*`
                    );
                    return;
                }
                
                const quantidadeStr = partes[1].toUpperCase();
                const numeroDestino = partes[2];
                
                // Validar número
                if (!/^8[0-9]{8}$/.test(numeroDestino)) {
                    await message.reply(`❌ Número inválido: *${numeroDestino}*\n\n✅ Use formato: 8XXXXXXXX`);
                    return;
                }
                
                // Converter quantidade para MB
                let quantidadeMB = 0;
                if (quantidadeStr.endsWith('GB')) {
                    const gb = parseFloat(quantidadeStr.replace('GB', ''));
                    quantidadeMB = gb * 1024;
                } else if (quantidadeStr.endsWith('MB')) {
                    quantidadeMB = parseInt(quantidadeStr.replace('MB', ''));
                } else {
                    await message.reply(`❌ Formato inválido: *${quantidadeStr}*\n\n✅ Use: 1GB, 1.5GB, 1024MB, etc.`);
                    return;
                }
                
                // Verificar saldo (buscar em todos os formatos)
                console.log(`🔍 Buscando saldo para saque: ${remetente}`);
                const saldo = await buscarSaldoBonus(remetente);
                if (!saldo || saldo.saldo < quantidadeMB) {
                    const saldoAtual = saldo ? saldo.saldo : 0;
                    await message.reply(
                        `❌ *SALDO INSUFICIENTE*\n\n` +
                        `💰 Teu saldo: ${saldoAtual}MB\n` +
                        `🎯 Solicitado: ${quantidadeMB}MB\n\n` +
                        `💡 Precisas de mais ${quantidadeMB - saldoAtual}MB\n` +
                        `🚀 Convida mais amigos para ganhar bônus!`
                    );
                    return;
                }
                
                // Verificar mínimo
                if (quantidadeMB < 1024) {
                    await message.reply(`❌ Valor mínimo para saque: *1GB (1024MB)*\n\n🎯 Solicitado: ${quantidadeMB}MB`);
                    return;
                }
                
                // === VALIDAÇÕES ADICIONAIS DE SEGURANÇA ===

                // Verificar se já existe saque pendente deste cliente
                const saquePendente = Object.values(pedidosSaque).find(s =>
                    s.cliente === remetente &&
                    s.status === 'pendente' &&
                    s.numeroDestino === numeroDestino
                );

                if (saquePendente) {
                    await message.reply(
                        `⚠️ *SAQUE PENDENTE DETECTADO*\n\n` +
                        `🔖 Referência: *${saquePendente.referencia}*\n` +
                        `📱 Número: ${saquePendente.numeroDestino}\n` +
                        `💎 Quantidade: ${saquePendente.quantidade}MB\n` +
                        `📅 Data: ${new Date(saquePendente.dataSolicitacao).toLocaleString('pt-BR')}\n\n` +
                        `⏳ Aguarde o processamento do saque anterior antes de solicitar um novo.\n` +
                        `📞 Prazo: até 24h`
                    );
                    return;
                }

                // Verificar limite diário de saques
                const hoje = new Date().toDateString();
                const saquesHoje = Object.values(pedidosSaque).filter(s =>
                    s.cliente === remetente &&
                    new Date(s.dataSolicitacao).toDateString() === hoje
                );

                if (saquesHoje.length >= 3) {
                    await message.reply(
                        `❌ *LIMITE DIÁRIO ATINGIDO*\n\n` +
                        `🚫 Limite: 3 saques por dia\n` +
                        `📊 Já solicitados hoje: ${saquesHoje.length}\n\n` +
                        `⏰ Tente novamente amanhã!`
                    );
                    return;
                }

                // === GERAR REFERÊNCIA ÚNICA PARA SAQUE ===
                const agora = new Date();
                let referenciaSaque = null;
                let tentativasGeracao = 0;
                const maxTentativasGeracao = 10;

                // Tentar gerar referência única
                while (!referenciaSaque && tentativasGeracao < maxTentativasGeracao) {
                    tentativasGeracao++;

                    // Gerar referência baseada em data + contador + tentativa
                    const anoMesDia = `${agora.getFullYear().toString().slice(-2)}${String(agora.getMonth() + 1).padStart(2, '0')}${String(agora.getDate()).padStart(2, '0')}`;
                    const contador = String(Object.keys(pedidosSaque).length + tentativasGeracao).padStart(3, '0');
                    const timestamp = String(Date.now()).slice(-3); // Últimos 3 dígitos do timestamp
                    const refCandidato = `SAQ${anoMesDia}${contador}`;

                    console.log(`🔄 Tentativa ${tentativasGeracao}: Gerando referência ${refCandidato}`);

                    // Verificar se já existe localmente
                    if (pedidosSaque[refCandidato]) {
                        console.warn(`⚠️ Referência ${refCandidato} já existe localmente, tentando outra...`);
                        continue;
                    }

                    // Verificar se já existe na planilha (fazer verificação prévia)
                    // Por enquanto, aceitar se não existir localmente
                    referenciaSaque = refCandidato;
                    console.log(`✅ Referência gerada: ${referenciaSaque}`);
                }

                // Se não conseguiu gerar referência única após todas as tentativas
                if (!referenciaSaque) {
                    console.error(`❌ ERRO CRÍTICO: Não foi possível gerar referência única após ${maxTentativasGeracao} tentativas`);
                    await message.reply(
                        `❌ *ERRO TEMPORÁRIO*\n\n` +
                        `⚠️ Ocorreu um erro ao gerar a referência do saque.\n` +
                        `🔄 Por favor, tente novamente em alguns segundos.\n\n` +
                        `📞 Se o problema persistir, contate o suporte.`
                    );
                    return;
                }

                console.log(`💰 INICIANDO SAQUE: ${referenciaSaque} para ${remetente} - ${quantidadeMB}MB`);

                // Criar pedido
                const pedido = {
                    referencia: referenciaSaque,
                    cliente: remetente,
                    nomeCliente: message._data.notifyName || 'N/A',
                    quantidade: quantidadeMB,
                    numeroDestino: numeroDestino,
                    dataSolicitacao: agora.toISOString(),
                    status: 'pendente',
                    grupo: message.from
                };

                // Salvar pedido ANTES de debitar
                pedidosSaque[referenciaSaque] = pedido;
                console.log(`✅ Pedido ${referenciaSaque} criado no sistema`);

                // === SALVAMENTO IMEDIATO #1: PEDIDO CRIADO ===
                console.log(`💾 Salvando pedido de saque imediatamente...`);
                await salvarDadosReferencia();

                // Debitar do saldo em todos os formatos
                await atualizarSaldoBonus(remetente, (saldoObj) => {
                    saldoObj.saldo -= quantidadeMB;
                    saldoObj.historicoSaques = saldoObj.historicoSaques || [];
                    saldoObj.historicoSaques.push({
                        referencia: referenciaSaque,
                        quantidade: quantidadeMB,
                        data: agora.toISOString()
                    });
                });
                console.log(`✅ Saldo debitado: -${quantidadeMB}MB`);

                // === SALVAMENTO IMEDIATO #2: SALDO DEBITADO ===
                console.log(`💾 Salvando saldo atualizado imediatamente...`);
                await salvarDadosReferencia();

                // Enviar para Tasker/Planilha com validação e RETRY automático em caso de duplicata
                const quantidadeFormatada = quantidadeMB >= 1024 ? `${(quantidadeMB/1024).toFixed(2)}GB` : `${quantidadeMB}MB`;
                let resultadoEnvio;
                let referenciaFinal = referenciaSaque;
                let tentativasEnvio = 0;
                const maxTentativasEnvio = 5;

                // Loop de retry com geração de nova referência em caso de duplicata
                while (tentativasEnvio < maxTentativasEnvio) {
                    tentativasEnvio++;

                    try {
                        console.log(`📊 Tentativa ${tentativasEnvio}/${maxTentativasEnvio}: Enviando saque ${referenciaFinal} para planilha...`);
                        resultadoEnvio = await enviarParaTasker(
                            referenciaFinal,
                            quantidadeMB,
                            numeroDestino,
                            message.from,
                            message._data.notifyName || 'Cliente'
                        );

                        // === VERIFICAR SE É DUPLICATA NA PLANILHA ===
                        if (resultadoEnvio && resultadoEnvio.duplicado) {
                            console.warn(`⚠️ DUPLICATA DETECTADA na planilha: ${referenciaFinal} (Status: ${resultadoEnvio.status_existente})`);

                            // Gerar nova referência independente do status
                            console.log(`🔄 Gerando nova referência para evitar duplicata (Status: ${resultadoEnvio.status_existente})...`);

                            // Remover pedido antigo
                            delete pedidosSaque[referenciaFinal];

                            // Gerar nova referência
                            const novaRefSufixo = String(Date.now()).slice(-4); // Últimos 4 dígitos do timestamp
                            const novaRef = `SAQ${agora.getFullYear().toString().slice(-2)}${String(agora.getMonth() + 1).padStart(2, '0')}${String(agora.getDate()).padStart(2, '0')}${novaRefSufixo}`;

                            console.log(`🆕 Nova referência gerada: ${novaRef}`);
                            referenciaFinal = novaRef;

                            // Atualizar histórico com nova referência
                            await atualizarSaldoBonus(remetente, (saldoObj) => {
                                if (saldoObj.historicoSaques && saldoObj.historicoSaques.length > 0) {
                                    saldoObj.historicoSaques[saldoObj.historicoSaques.length - 1].referencia = novaRef;
                                }
                            });

                            // Criar novo pedido com nova referência
                            pedidosSaque[novaRef] = {
                                referencia: novaRef,
                                cliente: remetente,
                                nomeCliente: message._data.notifyName || 'N/A',
                                quantidade: quantidadeMB,
                                numeroDestino: numeroDestino,
                                dataSolicitacao: agora.toISOString(),
                                status: 'pendente',
                                grupo: message.from
                            };

                            console.log(`✅ Pedido recriado com nova referência: ${novaRef}`);

                            // === SALVAMENTO IMEDIATO #5: NOVA REFERÊNCIA GERADA ===
                            console.log(`💾 Salvando nova referência imediatamente...`);
                            await salvarDadosReferencia();

                            // Continuar loop para tentar enviar com nova referência
                            continue;
                        }

                        // === VERIFICAR SE O ENVIO FOI BEM-SUCEDIDO ===
                        if (!resultadoEnvio || !resultadoEnvio.sucesso) {
                            console.error('❌ ERRO: Saque não foi enviado para a planilha!');
                            console.error('Resultado:', resultadoEnvio);

                            // Se não for duplicata, não tentar novamente - sair do loop
                            break;
                        }

                        // Sucesso! Sair do loop
                        console.log(`✅ Saque ${referenciaFinal} enviado com sucesso!`);
                        break;

                    } catch (error) {
                        console.error(`❌ Exceção na tentativa ${tentativasEnvio}:`, error.message);
                        // Em caso de exceção, sair do loop
                        break;
                    }
                }

                // Após todas as tentativas, verificar resultado final
                if (!resultadoEnvio || !resultadoEnvio.sucesso) {
                    console.error('❌ FALHA FINAL: Saque não foi enviado após todas as tentativas');
                    console.error('Resultado final:', resultadoEnvio);

                    // Reverter o débito do saldo
                    console.log(`🔄 Revertendo débito de ${quantidadeMB}MB...`);
                    await atualizarSaldoBonus(remetente, (saldoObj) => {
                        saldoObj.saldo += quantidadeMB;
                        if (saldoObj.historicoSaques && saldoObj.historicoSaques.length > 0) {
                            saldoObj.historicoSaques.pop();
                        }
                    });

                    // Remover pedido da lista
                    delete pedidosSaque[referenciaFinal];
                    console.log(`✅ Saldo restaurado e pedido removido`);

                    // === SALVAMENTO IMEDIATO #4: REVERSÃO DE SALDO ===
                    console.log(`💾 Salvando reversão de saldo imediatamente...`);
                    await salvarDadosReferencia();

                    await message.reply(
                        `❌ *ERRO AO PROCESSAR SAQUE*\n\n` +
                        `⚠️ Não foi possível enviar o pedido para a planilha.\n` +
                        `💰 Seu saldo foi restaurado.\n` +
                        `🔄 Por favor, tente novamente em alguns minutos.\n\n` +
                        `📞 Se o problema persistir, contate o suporte.\n` +
                        `🔖 Ref: ${referenciaFinal}`
                    );

                    // Tentar notificar admin
                    try {
                        const grupoInfo = await client.getChatById(message.from);
                        if (grupoInfo && grupoInfo.participants) {
                            const admins = grupoInfo.participants.filter(p => p.isAdmin || p.isSuperAdmin);
                            if (admins.length > 0) {
                                const adminId = admins[0].id._serialized;
                                const nomeClienteSeguro = sanitizeText(message._data.notifyName || 'N/A');

                                await client.sendMessage(adminId,
                                    `🚨 *ALERTA: FALHA NO SISTEMA DE SAQUE*\n\n` +
                                    `❌ Saque falhou após ${tentativasEnvio} tentativas.\n\n` +
                                    `📋 *Detalhes:*\n` +
                                    `🔖 Referência: ${referenciaFinal}\n` +
                                    `👤 Cliente: ${nomeClienteSeguro}\n` +
                                    `💰 Valor: ${quantidadeMB}MB\n\n` +
                                    `✅ Saldo restaurado.\n` +
                                    `🔧 Verifique Google Sheets.`
                                );
                                console.log(`📧 Notificação enviada ao admin`);
                            }
                        }
                    } catch (notifyError) {
                        console.error('❌ Falha ao notificar admin:', notifyError.message);
                    }

                    return;
                }

                // Sucesso! Marcar pedido como enviado
                console.log(`✅ Saque ${referenciaFinal} enviado com sucesso!`);
                if (pedidosSaque[referenciaFinal]) {
                    pedidosSaque[referenciaFinal].status = 'enviado';
                    pedidosSaque[referenciaFinal].dataEnvio = new Date().toISOString();

                    // === SALVAMENTO IMEDIATO #3: PEDIDO ENVIADO ===
                    console.log(`💾 Salvando status 'enviado' imediatamente...`);
                    await salvarDadosReferencia();
                }

                // Enviar mensagem de confirmação ao cliente
                try {
                    const saldoAtualizado = await buscarSaldoBonus(remetente);
                    const novoSaldo = saldoAtualizado ? saldoAtualizado.saldo : 0;

                    // Sanitizar nome do cliente (fallback para nome original se falhar)
                    let nomeCliente = message._data.notifyName || 'N/A';
                    try {
                        nomeCliente = sanitizeText(nomeCliente);
                    } catch (e) {
                        console.warn('⚠️ Erro ao sanitizar nome, usando original');
                    }

                    const mensagemSucesso = `✅ *SOLICITAÇÃO DE SAQUE CRIADA*\n\n` +
                        `👤 Cliente: ${nomeCliente}\n` +
                        `📱 Número: ${numeroDestino}\n` +
                        `💎 Quantidade: ${quantidadeFormatada}\n` +
                        `🔖 Referência: *${referenciaFinal}*\n` +
                        `⏰ Processamento: até 24h\n\n` +
                        `💰 *Novo saldo:* ${novoSaldo}MB\n\n` +
                        `✅ Pedido enviado para processamento!\n` +
                        `✅ Obrigado por usar nosso sistema de referências!`;

                    console.log(`📤 Enviando confirmação de saque no GRUPO...`);

                    // Enviar no GRUPO (reply na mensagem original)
                    await message.reply(mensagemSucesso);
                    console.log(`✅ Confirmação de saque enviada no GRUPO com sucesso!`);

                } catch (errorMensagem) {
                    console.error('❌ ERRO ao enviar mensagem de confirmação:', errorMensagem);
                    console.error('Stack:', errorMensagem.stack);

                    // Tentar enviar versão simplificada
                    try {
                        await client.sendMessage(message.from,
                            `✅ *SAQUE CRIADO*\n\n` +
                            `🔖 Referência: ${referenciaFinal}\n` +
                            `💎 Quantidade: ${quantidadeFormatada}\n` +
                            `📱 Número: ${numeroDestino}\n\n` +
                            `✅ Pedido em processamento!`
                        );
                        console.log(`✅ Mensagem simplificada enviada`);
                    } catch (errorSimples) {
                        console.error('❌ Falha também na mensagem simplificada:', errorSimples.message);
                    }
                }
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

        // === DETECÇÃO DE NOVOS MEMBROS (ALTERNATIVO) ===
        await detectarNovoMembro(message.from, autorMensagem, configGrupo);

        // === MODERAÇÃO ===
        if (message.type === 'chat') {
            // Verificar se é um comando administrativo antes da moderação
            const isComandoAdmin = message.body.startsWith('.') && (
                message.body.startsWith('.addcomando ') ||
                message.body.startsWith('.delcomando ') ||
                message.body.startsWith('.comandos') ||
                message.body.startsWith('.ia') ||
                message.body.startsWith('.stats') ||
                message.body.startsWith('.sheets') ||
                message.body.startsWith('.test_') ||
                message.body.startsWith('.grupos') ||
                message.body.startsWith('.clear_') ||
                message.body.startsWith('.ranking') ||
                message.body.startsWith('.inativos') ||
                message.body.startsWith('.detetives') ||
                message.body.startsWith('.semcompra') ||
                message.body.startsWith('.resetranking')
            );

            // Verificar se é admin executando comando
            const autorModeracaoMsg = message.author || message.from;
            const isAdminExecutando = isAdministrador(autorModeracaoMsg);

            // Pular moderação SOMENTE para comandos administrativos executados por admins
            const isPularModeracao = isComandoAdmin && isAdminExecutando;

            if (!isPularModeracao) {
                const analise = contemConteudoSuspeito(message.body);

                if (analise.suspeito) {
                    console.log(`🚨 Conteúdo suspeito detectado de ${autorModeracaoMsg}`);
                    await aplicarModeracao(message, "Link detectado");
                    return;
                }
            }
        }

        // === PROCESSAMENTO DE IMAGENS DESATIVADO ===
        if (message.type === 'image') {
            console.log(`📸 Imagem recebida - Processamento desativado`);

            await message.reply(
                '❌ Processamento de imagens desativado\n' +
                '📄 Solicitamos que o comprovante seja enviado em formato de texto.\n\n' +
                'ℹ️ Esta medida foi adotada para garantir que o sistema funcione de forma mais rápida, estável e com menos falhas.'
            );
            return;
        }

        if (message.type !== 'chat') {
            return;
        }

        // Comandos de tabela e pagamento
        if (/tabela/i.test(message.body)) {
            await safeReply(message, client, configGrupo.tabela);
            return;
        }

        if (/pagamento/i.test(message.body)) {
            await safeReply(message, client, configGrupo.pagamento);
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

        // === VERIFICAR COMANDOS CUSTOMIZADOS ===
        const textoMensagem = message.body.trim().toLowerCase();
        const respostaComando = executarComandoCustomizado(message.from, textoMensagem);
        
        if (respostaComando) {
            await message.reply(respostaComando);
            console.log(`🎯 Comando customizado '${textoMensagem}' executado no grupo ${message.from}`);
            return;
        }

        // === MONITORAMENTO DE CONFIRMAÇÕES DO BOT SECUNDÁRIO ===
        if (sistemaCompras && message.body.includes('✅') && message.body.includes('Transação Concluída Com Sucesso')) {
            // Extrair referência do padrão: "🔖 *Referência:* CI22H8QJSDQ"
            const regexReferencia = /🔖\s*\*?Referência:\*?\s*([A-Za-z0-9._-]+)/i;
            const matchReferencia = message.body.match(regexReferencia);
            
            // Extrair número do padrão: "📱 *Número:* 842362318"
            const regexNumero = /📱\s*\*?Número:\*?\s*(\d{9})/i;
            const matchNumero = message.body.match(regexNumero);
            
            if (matchReferencia && matchNumero) {
                const referenciaConfirmada = matchReferencia[1]; // Manter case original
                const numeroConfirmado = matchNumero[1];
                console.log(`🛒 CONFIRMAÇÃO BOT: Detectada transação concluída - Ref: ${referenciaConfirmada} | Número: ${numeroConfirmado}`);
                console.log(`🔍 CONFIRMAÇÃO BOT: Tipo detectado: ${/emola|e-mola/i.test(message.body) ? 'EMOLA' : /mpesa|m-pesa/i.test(message.body) ? 'MPESA' : 'DESCONHECIDO'}`);
                
                // Processar confirmação
                const resultadoConfirmacao = await sistemaCompras.processarConfirmacao(referenciaConfirmada, numeroConfirmado);
                
                if (resultadoConfirmacao) {
                    console.log(`✅ COMPRAS: Confirmação processada - ${resultadoConfirmacao.numero} | ${resultadoConfirmacao.megas}MB`);
                    
                    // Enviar mensagem de parabenização com menção clicável (igual às boas-vindas)
                    if (resultadoConfirmacao.mensagem && resultadoConfirmacao.contactId) {
                        try {
                            // Normalizar ID para formato @c.us igual às boas-vindas
                            const participantId = resultadoConfirmacao.contactId; // IGUAL ÀS BOAS-VINDAS
                            // Usar exato formato das boas-vindas
                            const mensagemFinal = resultadoConfirmacao.mensagem.replace('@NOME_PLACEHOLDER', `@${participantId.replace('@c.us', '').replace('@lid', '')}`);

                            // Enviar com menção igual às boas-vindas
                            await client.sendMessage(message.from, mensagemFinal, {
                                mentions: [participantId]
                            });
                        } catch (error) {
                            console.error('❌ Erro ao enviar parabenização com menção:', error);
                            // Fallback: enviar sem menção clicável
                            const participantId = resultadoConfirmacao.contactId; // IGUAL ÀS BOAS-VINDAS
                            const mensagemFallback = resultadoConfirmacao.mensagem.replace('@NOME_PLACEHOLDER', `@${participantId.replace('@c.us', '').replace('@lid', '')}`);
                            await message.reply(mensagemFallback);
                        }
                    }
                } else {
                    console.log(`⚠️ COMPRAS: Confirmação ${referenciaConfirmada} não encontrada ou já processada`);
                }
                return;
            }
        }

        // === PROCESSAMENTO COM IA (LÓGICA SIMPLES IGUAL AO BOT ATACADO) ===
        const remetente = message.author || message.from;
        const resultadoIA = await ia.processarMensagemBot(message.body, remetente, 'texto', configGrupo);
        
        if (resultadoIA.erro) {
            console.error(`❌ Erro na IA:`, resultadoIA.mensagem);
            return;
        }

        if (resultadoIA.sucesso) {
            
            if (resultadoIA.tipo === 'comprovante_recebido' || resultadoIA.tipo === 'comprovante_imagem_recebido') {
                const metodoInfo = resultadoIA.metodo ? ` (${resultadoIA.metodo})` : '';
                await message.reply(
                    `✅ *Comprovante processado${metodoInfo}!*\n\n` +
                    `💰 Referência: ${resultadoIA.referencia}\n` +
                    `📊 Megas: ${resultadoIA.megas}\n\n` +
                    `📱 *Envie UM número que vai receber ${resultadoIA.megas}!*`
                );
                return;
                
            } else if (resultadoIA.tipo === 'numero_processado_com_aviso') {
                const dadosCompletos = resultadoIA.dadosCompletos;
                const [referencia, megas, numero] = dadosCompletos.split('|');
                const nomeContato = message._data.notifyName || 'N/A';
                const autorMensagem = message.author || 'Desconhecido';

                // === VERIFICAÇÃO DE VALOR MUITO BAIXO ===
                if (megas === 'VALOR_MUITO_BAIXO') {
                    console.log(`❌ VALOR MUITO BAIXO: ${referencia} - valor abaixo do pacote mínimo`);

                    const configGrupo = getConfiguracaoGrupo(message.from);
                    const precos = ia.extrairPrecosTabela(configGrupo.tabela);
                    const menorPreco = Math.min(...precos.map(p => p.preco));

                    await message.reply(
                        `❌ *Valor muito baixo*\n\n` +
                        `💳 O valor transferido está abaixo do pacote mínimo disponível.\n\n` +
                        `📋 *Pacote mais barato:* ${menorPreco}MT\n\n` +
                        `💡 *Para ver todos os pacotes:* digite "tabela"`
                    );
                    return;
                }

                // PROCESSAR BÔNUS DE REFERÊNCIA
                const bonusInfo = await processarBonusCompra(remetente, megas);

                // VERIFICAR PAGAMENTO ANTES DE ENVIAR PARA PLANILHA
                // Usar o valor real do comprovante (não o valor calculado dos megas)
                const valorComprovante = resultadoIA.valorComprovante || megas;
                const pagamentoConfirmado = await verificarPagamentoIndividual(referencia, valorComprovante);

                // Verificar se pagamento já foi processado
                if (pagamentoConfirmado === 'JA_PROCESSADO') {
                    console.log(`⚠️ REVENDEDORES: Pagamento ${referencia} já foi processado anteriormente!`);
                    await message.reply(
                        `⚠️ *PAGAMENTO JÁ PROCESSADO*\n\n` +
                        `💰 Referência: ${referencia}\n` +
                        `📊 Megas: ${megas} MB\n` +
                        `📱 Número: ${numero}\n\n` +
                        `❌ Este pagamento já foi processado anteriormente.\n` +
                        `📝 Evite enviar o mesmo comprovante múltiplas vezes.\n\n` +
                        `⏰ ${new Date().toLocaleString('pt-BR')}`
                    );
                    return;
                }

                if (!pagamentoConfirmado) {
                    console.log(`❌ REVENDEDORES: Pagamento não confirmado para texto - ${referencia} (${valorComprovante}MT)`);

                    // Adicionar à fila de retry silencioso
                    await adicionarPagamentoPendente(referencia, valorComprovante, dadosCompletos, message, resultadoIA);

                    await message.reply(
                        `⏳ *AGUARDANDO MENSAGEM DE CONFIRMAÇÃO*\n\n` +
                        `💰 Referência: ${referencia}\n` +
                        `📊 Megas: ${megas} MB\n` +
                        `📱 Número: ${numero}\n` +
                        `💳 Valor: ${valorComprovante}MT\n\n` +
                        `📨 A mensagem de confirmação ainda não foi recebida no sistema.\n` +
                        `🔄 Verificação automática ativa - você será notificado quando confirmado!\n` +
                        `⏰ ${new Date().toLocaleString('pt-BR')}`
                    );
                    return;
                }

                console.log(`✅ REVENDEDORES: Pagamento confirmado para texto! Processando...`);

                const resultadoEnvio = await enviarParaTasker(referencia, megas, numero, message.from, autorMensagem);

                // Verificar se é pedido duplicado
                if (resultadoEnvio && resultadoEnvio.duplicado) {
                    const statusTexto = resultadoEnvio.status_existente === 'PROCESSADO' ? 'já foi processado' : 'está pendente na fila';
                    await message.reply(
                        `⚠️ *PEDIDO DUPLICADO DETECTADO*\n\n` +
                        `💰 Referência: ${referencia}\n` +
                        `📊 Megas: ${megas} MB\n` +
                        `📱 Número: ${numero}\n\n` +
                        `❌ Este pedido ${statusTexto}.\n` +
                        `📝 Status: ${resultadoEnvio.status_existente}\n\n` +
                        `⏰ ${new Date().toLocaleString('pt-BR')}`
                    );
                    return;
                }

                // === MARCAR PAGAMENTO COMO PROCESSADO APÓS ENVIO BEM-SUCEDIDO ===
                if (resultadoEnvio && resultadoEnvio.sucesso) {
                    await marcarPagamentoComoProcessado(referencia, valorComprovante);
                }

                await registrarComprador(message.from, numero, nomeContato, megas);

                // REMOVIDO: Encaminhamento de mensagens (sistema movido para outro bot)

                // Enviar mensagem normal + aviso da tabela
                await message.reply(
                    `✅ *Pedido Recebido!*\n\n` +
                    `💰 Referência: ${referencia}\n` +
                    `📊 Megas: ${megas} MB\n` +
                    `📱 Número: ${numero}\n\n` +
                    `${resultadoIA.avisoTabela}`
                );
                return;
                
            } else if (resultadoIA.tipo === 'numero_processado') {
                const dadosCompletos = resultadoIA.dadosCompletos;
                const [referencia, megas, numero] = dadosCompletos.split('|');
                const nomeContato = message._data.notifyName || 'N/A';
                const autorMensagem = message.author || 'Desconhecido';

                // === VERIFICAÇÃO DE VALOR MUITO BAIXO ===
                if (megas === 'VALOR_MUITO_BAIXO') {
                    console.log(`❌ VALOR MUITO BAIXO: ${referencia} - valor abaixo do pacote mínimo`);

                    const configGrupo = getConfiguracaoGrupo(message.from);
                    const precos = ia.extrairPrecosTabela(configGrupo.tabela);
                    const menorPreco = Math.min(...precos.map(p => p.preco));

                    await message.reply(
                        `❌ *Valor muito baixo*\n\n` +
                        `💳 O valor transferido está abaixo do pacote mínimo disponível.\n\n` +
                        `📋 *Pacote mais barato:* ${menorPreco}MT\n\n` +
                        `💡 *Para ver todos os pacotes:* digite "tabela"`
                    );
                    return;
                }

                // PROCESSAR BÔNUS DE REFERÊNCIA
                const bonusInfo = await processarBonusCompra(remetente, megas);

                // VERIFICAR PAGAMENTO ANTES DE ENVIAR PARA PLANILHA
                // Usar o valor real do comprovante (não o valor calculado dos megas)
                const valorComprovante = resultadoIA.valorComprovante || megas;
                const pagamentoConfirmado = await verificarPagamentoIndividual(referencia, valorComprovante);

                // Verificar se pagamento já foi processado
                if (pagamentoConfirmado === 'JA_PROCESSADO') {
                    console.log(`⚠️ REVENDEDORES: Pagamento ${referencia} já foi processado anteriormente!`);
                    await message.reply(
                        `⚠️ *PAGAMENTO JÁ PROCESSADO*\n\n` +
                        `💰 Referência: ${referencia}\n` +
                        `📊 Megas: ${megas} MB\n` +
                        `📱 Número: ${numero}\n\n` +
                        `❌ Este pagamento já foi processado anteriormente.\n` +
                        `📝 Evite enviar o mesmo comprovante múltiplas vezes.\n\n` +
                        `⏰ ${new Date().toLocaleString('pt-BR')}`
                    );
                    return;
                }

                if (!pagamentoConfirmado) {
                    console.log(`❌ REVENDEDORES: Pagamento não confirmado para texto - ${referencia} (${valorComprovante}MT)`);

                    // Adicionar à fila de retry silencioso
                    await adicionarPagamentoPendente(referencia, valorComprovante, dadosCompletos, message, resultadoIA);

                    await message.reply(
                        `⏳ *AGUARDANDO MENSAGEM DE CONFIRMAÇÃO*\n\n` +
                        `💰 Referência: ${referencia}\n` +
                        `📊 Megas: ${megas} MB\n` +
                        `📱 Número: ${numero}\n` +
                        `💳 Valor: ${valorComprovante}MT\n\n` +
                        `📨 A mensagem de confirmação ainda não foi recebida no sistema.\n` +
                        `🔄 Verificação automática ativa - você será notificado quando confirmado!\n` +
                        `⏰ ${new Date().toLocaleString('pt-BR')}`
                    );
                    return;
                }

                console.log(`✅ REVENDEDORES: Pagamento confirmado para texto! Processando...`);

                const resultadoEnvio = await enviarParaTasker(referencia, megas, numero, message.from, autorMensagem);

                // Verificar se é pedido duplicado
                if (resultadoEnvio && resultadoEnvio.duplicado) {
                    const statusTexto = resultadoEnvio.status_existente === 'PROCESSADO' ? 'já foi processado' : 'está pendente na fila';
                    await message.reply(
                        `⚠️ *PEDIDO DUPLICADO DETECTADO*\n\n` +
                        `💰 Referência: ${referencia}\n` +
                        `📊 Megas: ${megas} MB\n` +
                        `📱 Número: ${numero}\n\n` +
                        `❌ Este pedido ${statusTexto}.\n` +
                        `📝 Status: ${resultadoEnvio.status_existente}\n\n` +
                        `⏰ ${new Date().toLocaleString('pt-BR')}`
                    );
                    return;
                }

                // === MARCAR PAGAMENTO COMO PROCESSADO APÓS ENVIO BEM-SUCEDIDO ===
                if (resultadoEnvio && resultadoEnvio.sucesso) {
                    await marcarPagamentoComoProcessado(referencia, valorComprovante);
                }

                await registrarComprador(message.from, numero, nomeContato, megas);

                // REMOVIDO: Encaminhamento de mensagens (sistema movido para outro bot)

                await message.reply(
                    `✅ *Pedido Recebido!*\n\n` +
                    `💰 Referência: ${referencia}\n` +
                    `📊 Megas: ${megas}\n` +
                    `📱 Número: ${numero}\n\n` +
                    `_⏳Processando... Aguarde enquanto o Sistema executa a transferência_`
                );
                return;

            } else if (resultadoIA.tipo === 'divisao_blocos') {
                // === PROCESSAR DIVISÃO EM BLOCOS ===
                console.log(`🔧 Processando divisão em blocos...`);

                const dadosCompletos = resultadoIA.dadosCompletos;
                const blocos = dadosCompletos.split('\n');
                const valorComprovante = resultadoIA.valorComprovante;
                const nomeContato = message._data.notifyName || 'N/A';
                const autorMensagem = message.author || 'Desconhecido';

                console.log(`📦 Total de blocos a enviar: ${blocos.length}`);

                // Verificar pagamento antes de processar
                const primeiraLinha = blocos[0].split('|');
                const referenciaOriginal = primeiraLinha[0];

                const pagamentoConfirmado = await verificarPagamentoIndividual(referenciaOriginal, valorComprovante);

                if (pagamentoConfirmado === 'JA_PROCESSADO') {
                    console.log(`⚠️ REVENDEDORES: Pagamento ${referenciaOriginal} já foi processado anteriormente!`);
                    await message.reply(
                        `⚠️ *PAGAMENTO JÁ PROCESSADO*\n\n` +
                        `💰 Referência: ${referenciaOriginal}\n` +
                        `📊 Total: ${resultadoIA.megasPorNumero}MB\n` +
                        `📦 Blocos: ${blocos.length}\n\n` +
                        `❌ Este pagamento já foi processado anteriormente.\n\n` +
                        `⏰ ${new Date().toLocaleString('pt-BR')}`
                    );
                    return;
                }

                if (!pagamentoConfirmado) {
                    console.log(`❌ REVENDEDORES: Pagamento não confirmado para divisão - ${referenciaOriginal} (${valorComprovante}MT)`);
                    await message.reply(
                        `⏳ *AGUARDANDO CONFIRMAÇÃO DE PAGAMENTO*\n\n` +
                        `💰 Referência: ${referenciaOriginal}\n` +
                        `📊 Total: ${resultadoIA.megasPorNumero}MB\n` +
                        `📦 Blocos: ${blocos.length}\n` +
                        `💳 Valor: ${valorComprovante}MT\n\n` +
                        `📨 A mensagem de confirmação ainda não foi recebida no sistema.\n` +
                        `🔄 Verificação automática ativa - você será notificado quando confirmado!\n` +
                        `⏰ ${new Date().toLocaleString('pt-BR')}`
                    );
                    return;
                }

                console.log(`✅ REVENDEDORES: Pagamento confirmado! Enviando ${blocos.length} blocos...`);

                // Enviar cada bloco para a planilha
                let sucessos = 0;
                let falhas = 0;

                for (let i = 0; i < blocos.length; i++) {
                    const bloco = blocos[i];
                    const [refBloco, megasBloco, numeroBloco] = bloco.split('|');

                    console.log(`📤 Enviando bloco ${i + 1}/${blocos.length}: ${refBloco} - ${megasBloco}MB`);

                    const resultadoEnvio = await enviarParaTasker(refBloco, megasBloco, numeroBloco, message.from, autorMensagem);

                    if (resultadoEnvio && resultadoEnvio.sucesso) {
                        sucessos++;
                    } else if (resultadoEnvio && resultadoEnvio.duplicado) {
                        console.log(`⚠️ Bloco ${refBloco} já existe, continuando...`);
                        sucessos++; // Contar como sucesso se já existe
                    } else {
                        falhas++;
                        console.error(`❌ Falha ao enviar bloco ${refBloco}`);
                    }

                    // Pequeno delay entre envios
                    if (i < blocos.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }

                // Marcar pagamento como processado após todos os blocos
                if (sucessos > 0) {
                    await marcarPagamentoComoProcessado(referenciaOriginal, valorComprovante);
                }

                // Registrar comprador (com megas totais)
                const primeiroNumero = blocos[0].split('|')[2];
                await registrarComprador(message.from, primeiroNumero, nomeContato, resultadoIA.megasPorNumero);

                // Responder ao cliente (mesma mensagem padrão, sem mencionar divisão)
                await message.reply(
                    `✅ *Pedido Recebido!*\n\n` +
                    `💰 Referência: ${referenciaOriginal}\n` +
                    `📊 Megas: ${resultadoIA.megasPorNumero}\n` +
                    `📱 Número: ${primeiroNumero}\n\n` +
                    `_⏳Processando... Aguarde enquanto o Sistema executa a transferência_`
                );

                console.log(`✅ Divisão concluída: ${sucessos} sucessos, ${falhas} falhas`);
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
}

// Novo handler principal com queue
client.on('message', async (message) => {
    try {
        // LOG: Verificar se é administrador enviando mensagem em grupo
        if (message.from.endsWith('@g.us')) {
            const autorMensagem = message.author || message.from;
            if (isAdministrador(autorMensagem)) {
                const chat = await message.getChat();
                const nomeGrupo = chat.name || 'Grupo';
                const contato = await message.getContact();
                const nomeAdmin = contato.pushname || contato.name || autorMensagem;
                console.log(`👑 ADMIN DETECTADO: ${nomeAdmin} (${autorMensagem}) enviou mensagem no grupo "${nomeGrupo}"`);
            }
        }

        // PRIMEIRO: Tentar aprender mapeamentos LID automaticamente
        await aprenderMapeamento(message);

        // Registrar primeira mensagem do membro no grupo (se for grupo)
        // REMOVIDO: Registro de primeira mensagem (sistema movido para outro bot)

        // Segundo: tentar processar comandos administrativos rápidos
        const adminProcessed = await handleAdminCommands(message);
        if (adminProcessed) return;

        // Segundo: verificar se precisa ir para fila
        const needsQueue = await handlePurchaseCommands(message);

        if (needsQueue) {
            // Adicionar à fila assíncrona para processamento
            await messageQueue.add(message, processMessage);
        } else {
            // Processar diretamente mensagens simples
            await processMessage(message);
        }

    } catch (error) {
        console.error('❌ Erro no handler principal de mensagem:', error);
    }
});

client.on('disconnected', (reason) => {
    console.log('❌ Bot desconectado:', reason);
});

// Capturar erros não tratados
process.on('unhandledRejection', (reason, promise) => {
    if (reason.message && reason.message.includes('Execution context was destroyed')) {
        console.log('⚠️ Contexto do Puppeteer reiniciado, continuando...');
    } else {
        console.error('❌ Promise rejeitada:', reason);
    }
});

process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error.message);
});

// === INICIALIZAÇÃO ===
(async function inicializar() {
    console.log('🚀 Iniciando bot...');
    await carregarComandosCustomizados();
    console.log('🔧 Comandos carregados, inicializando cliente WhatsApp...');
    
    try {
        client.initialize();
        console.log('📱 Cliente WhatsApp inicializado, aguardando conexão...');
    } catch (error) {
        console.error('❌ Erro ao inicializar cliente:', error);
    }
})();

// === APENAS 3 TIMERS ESSENCIAIS (SEGUINDO PADRÃO BOT1) ===

// 1. Salvar histórico a cada 5 minutos (como bot1)
setInterval(salvarHistorico, 5 * 60 * 1000);

// 2. Limpar cache geral a cada hora (como bot1 - simples e eficaz)
setInterval(() => {
    // Limpar cache de transações
    if (cacheTransacoes.size > 200) {
        const keys = Array.from(cacheTransacoes.keys());
        const oldKeys = keys.slice(0, keys.length - 100);
        oldKeys.forEach(key => cacheTransacoes.delete(key));
    }

    // Limpar cache admin seguindo padrão bot1 (similar ao bot1: > 50 = clear)
    if (adminCache.size > 50) {
        adminCache.clear();
    }

    // Limpar outros caches seguindo padrão bot1
    if (gruposLogados && gruposLogados.size > 50) gruposLogados.clear();
    if (membrosProcessadosViaEvent && membrosProcessadosViaEvent.size > 50) membrosProcessadosViaEvent.clear();

    console.log('🗑️ Cache geral limpo');
}, 60 * 60 * 1000); // A cada hora

// 3. Limpar cache de grupos a cada 2 horas (como bot1)
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
    console.log('\n💾 Salvando dados finais...');

    try {
        // Salvar apenas dados importantes (sem arquivos desnecessários)
        await Promise.allSettled([
            salvarDadosReferencia(),
            salvarHistorico()
        ]);

        console.log('✅ Dados salvos com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao salvar:', error);
    }

    console.log('🧠 IA: ATIVA');
    console.log('📊 Google Sheets: CONFIGURADO');
    console.log(`🔗 URL: ${GOOGLE_SHEETS_CONFIG.scriptUrl}`);
    console.log('🤖 Bot Retalho - Funcionamento otimizado');
    console.log(ia.getStatus());
    process.exit(0);
});










