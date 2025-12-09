const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');

/**
 * BaileysAdapter - Camada de compatibilidade com whatsapp-web.js
 * Permite usar Baileys com a mesma API do whatsapp-web.js
 */
class BaileysAdapter {
    constructor() {
        this.sock = null;
        this.eventHandlers = {
            qr: [],
            ready: [],
            message: [],
            message_create: [],
            group_join: [],
            authenticated: [],
            auth_failure: [],
            disconnected: []
        };
        this.isReady = false;
        this.messageCache = new Map(); // Cache de mensagens para evitar duplicatas
        this.mapeamentoLidCache = null; // Cache de mapeamentos LID
    }

    // === INICIALIZAÇÃO ===
    async initialize() {
        try {
            console.log('🚀 Inicializando Baileys...');

            // Carregar estado de autenticação
            const { state, saveCreds } = await useMultiFileAuthState('auth_baileys');
            const { version } = await fetchLatestBaileysVersion();

            console.log(`📱 Usando WhatsApp Web v${version.join('.')}`);

            // Criar socket Baileys
            this.sock = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
                },
                printQRInTerminal: false, // Vamos gerar nosso próprio QR
                logger: P({ level: 'silent' }),
                browser: ['Bot WhatsApp IA', 'Chrome', '120.0.0'],
                markOnlineOnConnect: true
            });

            // Salvar credenciais automaticamente
            this.sock.ev.on('creds.update', saveCreds);

            // === GERENCIAR CONEXÃO ===
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // QR Code
                if (qr) {
                    console.log('📱 QR Code gerado!');
                    this.eventHandlers.qr.forEach(handler => handler(qr));
                }

                // Desconexão
                if (connection === 'close') {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

                    console.log(`❌ Conexão fechada. Código: ${statusCode}`);

                    if (statusCode === DisconnectReason.loggedOut) {
                        console.log('⚠️ Deslogado! Escaneie o QR novamente.');
                        this.isReady = false;
                        this.eventHandlers.auth_failure.forEach(handler => handler('LOGOUT'));

                        // Limpar pasta de autenticação
                        if (fs.existsSync('auth_baileys')) {
                            fs.rmSync('auth_baileys', { recursive: true, force: true });
                        }

                        // Reconectar para gerar novo QR
                        await this.initialize();
                    } else if (shouldReconnect) {
                        console.log('🔄 Reconectando em 5 segundos...');
                        setTimeout(() => this.initialize(), 5000);
                    } else {
                        this.isReady = false;
                        this.eventHandlers.disconnected.forEach(handler => handler('DISCONNECTED'));
                    }
                }

                // Conectado
                if (connection === 'open') {
                    console.log('✅ Conectado ao WhatsApp!');
                    this.isReady = true;
                    this.eventHandlers.authenticated.forEach(handler => handler());
                    this.eventHandlers.ready.forEach(handler => handler());
                }
            });

            // === GERENCIAR MENSAGENS ===
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (type !== 'notify') return;

                for (const msg of messages) {
                    // Evitar processar mensagens duplicadas
                    const msgId = msg.key.id;
                    if (this.messageCache.has(msgId)) continue;

                    this.messageCache.set(msgId, true);

                    // Limpar cache antigo (manter últimas 1000 mensagens)
                    if (this.messageCache.size > 1000) {
                        const firstKey = this.messageCache.keys().next().value;
                        this.messageCache.delete(firstKey);
                    }

                    // Ignorar mensagens próprias (a menos que seja message_create)
                    if (msg.key.fromMe) {
                        const adaptedMsg = this.adaptMessage(msg);
                        this.eventHandlers.message_create.forEach(handler => handler(adaptedMsg));
                        continue;
                    }

                    // Converter para formato compatível
                    const adaptedMessage = this.adaptMessage(msg);

                    // Emitir eventos
                    this.eventHandlers.message.forEach(handler => handler(adaptedMessage));
                    this.eventHandlers.message_create.forEach(handler => handler(adaptedMessage));
                }
            });

            // === GERENCIAR EVENTOS DE GRUPO ===
            this.sock.ev.on('group-participants.update', async (update) => {
                try {
                    if (update.action === 'add') {
                        const adaptedEvent = {
                            chatId: update.id,
                            participants: update.participants.map(p => ({
                                id: { _serialized: p }
                            })),
                            author: update.author
                        };
                        this.eventHandlers.group_join.forEach(handler => handler(adaptedEvent));
                    }
                } catch (error) {
                    console.error('❌ Erro ao processar group-participants.update:', error.message);
                }
            });

        } catch (error) {
            console.error('❌ Erro ao inicializar Baileys:', error);
            throw error;
        }
    }

    // === ADAPTADOR DE MENSAGEM ===
    adaptMessage(baileysMsg) {
        const message = baileysMsg.message;
        const isGroup = baileysMsg.key.remoteJid?.endsWith('@g.us');
        const chatId = baileysMsg.key.remoteJid;
        const participant = baileysMsg.key.participant || baileysMsg.key.remoteJid;

        // Detectar tipo de mensagem
        let messageType = 'chat';
        let bodyText = '';

        if (message?.imageMessage) {
            messageType = 'image';
            bodyText = message.imageMessage.caption || '';
        } else if (message?.videoMessage) {
            messageType = 'video';
            bodyText = message.videoMessage.caption || '';
        } else if (message?.audioMessage) {
            messageType = 'audio';
        } else if (message?.documentMessage) {
            messageType = 'document';
            bodyText = message.documentMessage.caption || '';
        } else if (message?.stickerMessage) {
            messageType = 'sticker';
        } else if (message?.conversation) {
            messageType = 'chat';
            bodyText = message.conversation;
        } else if (message?.extendedTextMessage?.text) {
            messageType = 'chat';
            bodyText = message.extendedTextMessage.text;
        }

        return {
            // Campos básicos
            from: chatId,
            author: isGroup ? participant : chatId,
            body: bodyText,
            type: messageType,

            // ID serializado (compatível com whatsapp-web.js)
            id: {
                _serialized: `${chatId}_${baileysMsg.key.id}`,
                id: baileysMsg.key.id,
                remote: chatId,
                fromMe: baileysMsg.key.fromMe || false
            },

            // Métodos compatíveis
            reply: async (text) => {
                return await this.sendMessage(chatId, text, {
                    quoted: baileysMsg
                });
            },

            delete: async (everywhere = false) => {
                try {
                    return await this.sock.sendMessage(chatId, {
                        delete: baileysMsg.key
                    });
                } catch (error) {
                    console.error('❌ Erro ao deletar mensagem:', error.message);
                    return false;
                }
            },

            getContact: async () => {
                const contactId = isGroup ? participant : chatId;
                return await this.getContactById(contactId);
            },

            getChat: async () => {
                return await this.getChatById(chatId);
            },

            // Dados internos
            _data: {
                notifyName: baileysMsg.pushName || 'Desconhecido',
                id: {
                    fromMe: baileysMsg.key.fromMe || false,
                    remote: chatId,
                    _serialized: `${chatId}_${baileysMsg.key.id}`
                }
            },

            // Mensagem original do Baileys
            _baileys: baileysMsg
        };
    }

    // === MÉTODOS COMPATÍVEIS COM WHATSAPP-WEB.JS ===

    async sendMessage(chatId, content, options = {}) {
        try {
            const message = {
                text: content
            };

            // Suporte a mentions
            if (options.mentions && options.mentions.length > 0) {
                message.mentions = options.mentions;
            }

            // Suporte a quoted (reply)
            if (options.quoted) {
                message.quoted = options.quoted;
            }

            const sent = await this.sock.sendMessage(chatId, message);
            return sent;
        } catch (error) {
            console.error(`❌ Erro ao enviar mensagem para ${chatId}:`, error.message);
            throw error;
        }
    }

    async getChats() {
        try {
            const chats = await this.sock.groupFetchAllParticipating();

            return Object.values(chats).map(chat => ({
                id: {
                    _serialized: chat.id
                },
                name: chat.subject,
                isGroup: true,
                participants: chat.participants.map(p => ({
                    id: {
                        _serialized: p.id
                    }
                }))
            }));
        } catch (error) {
            console.error('❌ Erro ao buscar chats:', error.message);
            return [];
        }
    }

    async getChatById(chatId) {
        try {
            if (chatId.endsWith('@g.us')) {
                const metadata = await this.sock.groupMetadata(chatId);

                return {
                    id: {
                        _serialized: chatId
                    },
                    name: metadata.subject,
                    isGroup: true,
                    participants: metadata.participants.map(p => ({
                        id: {
                            _serialized: p.id
                        }
                    })),

                    // Métodos
                    fetchMessages: async (options = {}) => {
                        const limit = options.limit || 50;
                        // Baileys não tem método direto para buscar mensagens antigas
                        // Retornar array vazio por enquanto
                        console.log('⚠️ fetchMessages não implementado completamente no Baileys');
                        return [];
                    },

                    removeParticipants: async (participants) => {
                        return await this.sock.groupParticipantsUpdate(
                            chatId,
                            participants,
                            'remove'
                        );
                    },

                    sendMessage: async (content, options = {}) => {
                        return await this.sendMessage(chatId, content, options);
                    }
                };
            } else {
                // Chat privado
                return {
                    id: {
                        _serialized: chatId
                    },
                    isGroup: false
                };
            }
        } catch (error) {
            console.error(`❌ Erro ao buscar chat ${chatId}:`, error.message);
            return null;
        }
    }

    async getContactById(contactId) {
        try {
            // Simplesmente retornar uma estrutura básica compatível com whatsapp-web.js
            // NÃO tentar converter @lid ou buscar no WhatsApp
            // O número limpo é apenas o ID sem o sufixo
            const number = contactId.replace('@c.us', '').replace('@lid', '').replace('@s.whatsapp.net', '');

            return {
                id: {
                    _serialized: contactId,
                    user: number
                },
                number: number,
                pushname: contactId, // Retornar o ID original como pushname
                name: contactId      // Retornar o ID original como name
            };
        } catch (error) {
            console.error(`❌ Erro ao buscar contato ${contactId}:`, error.message);
            return {
                id: { _serialized: contactId },
                number: contactId.replace('@c.us', '').replace('@lid', ''),
                pushname: contactId,
                name: contactId
            };
        }
    }

    async getState() {
        return this.isReady ? 'CONNECTED' : 'DISCONNECTED';
    }

    // === GERENCIAMENTO DE EVENTOS ===
    on(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].push(handler);
        } else {
            console.warn(`⚠️ Evento '${event}' não suportado pelo adapter`);
        }
    }

    // === MÉTODOS AUXILIARES ===
    async destroy() {
        if (this.sock) {
            await this.sock.logout();
            this.sock = null;
            this.isReady = false;
        }
    }
}

module.exports = { BaileysAdapter };
