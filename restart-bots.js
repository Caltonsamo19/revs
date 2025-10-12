#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);

// === CONFIGURAÇÃO DOS BOTS ===
const BOTS = [
    {
        name: 'bot-revendedores1',
        dir: '/root/bot-revededores1',
        cacheDir: '.wwebjs_cache'
    },
    {
        name: 'kelven',
        dir: '/root/bot-kelven',
        cacheDir: '.wwebjs_cache'
    },
    {
        name: 'isaac',
        dir: '/root/bot-isaac',
        cacheDir: '.wwebjs_cache'
    },
    {
        name: 'durst',
        dir: '/root/bot-durst',
        cacheDir: '.wwebjs_cache'
    },
    {
        name: 'ercilio',
        dir: '/root/bot-ercilio',
        cacheDir: '.wwebjs_cache'
    },
    {
        name: 'bot-mensagens',
        dir: '/root/confirmações',
        cacheDir: '.wwebjs_cache'
    }
];

const TEMPO_ESPERA_REINICIO = 5 * 60 * 1000; // 5 minutos para bot voltar online após restart
const TEMPO_ESPERA_ESTABILIZACAO = 60000; // 1 minuto após voltar online (para estabilizar e notificar)
const TEMPO_AGUARDAR_NOTIFICACAO = 15000; // 15 segundos para bot enviar notificação antes de desligar

// === FUNÇÕES UTILITÁRIAS ===
function log(mensagem, tipo = 'INFO') {
    const timestamp = new Date().toLocaleString('pt-BR');
    const emoji = {
        'INFO': 'ℹ️',
        'SUCCESS': '✅',
        'ERROR': '❌',
        'WARNING': '⚠️',
        'CLEAN': '🧹',
        'RESTART': '🔄',
        'WAIT': '⏳'
    }[tipo] || 'ℹ️';

    console.log(`[${timestamp}] ${emoji} ${mensagem}`);
}

// Criar sinal para bot notificar antes de reiniciar
async function criarSinalPreRestart(bot) {
    try {
        const sinalPath = path.join(bot.dir, '.restart_signal.json');
        await fs.writeFile(sinalPath, JSON.stringify({
            tipo: 'pre-restart',
            horaSinal: new Date().toISOString()
        }));
        log(`Sinal de pré-restart criado: ${bot.name}`, 'INFO');
    } catch (error) {
        log(`Erro ao criar sinal para ${bot.name}: ${error.message}`, 'ERROR');
    }
}

// Limpar cache de um bot
async function limparCache(bot) {
    try {
        const cachePath = path.join(bot.dir, bot.cacheDir);
        log(`Limpando cache: ${cachePath}`, 'CLEAN');

        // Verificar se o diretório existe
        try {
            await fs.access(cachePath);
            await fs.rm(cachePath, { recursive: true, force: true });
            log(`Cache limpa com sucesso: ${bot.name}`, 'SUCCESS');
        } catch (error) {
            if (error.code === 'ENOENT') {
                log(`Cache não encontrada (já limpa): ${bot.name}`, 'INFO');
            } else {
                throw error;
            }
        }
    } catch (error) {
        log(`Erro ao limpar cache de ${bot.name}: ${error.message}`, 'ERROR');
        throw error;
    }
}

// Verificar status do bot
async function verificarStatusBot(botName) {
    try {
        const { stdout } = await execPromise(`pm2 jlist`);
        const processes = JSON.parse(stdout);
        const bot = processes.find(p => p.name === botName);

        if (bot) {
            return {
                online: bot.pm2_env.status === 'online',
                status: bot.pm2_env.status,
                uptime: bot.pm2_env.pm_uptime,
                restarts: bot.pm2_env.restart_time
            };
        }
        return { online: false, status: 'not_found' };
    } catch (error) {
        log(`Erro ao verificar status de ${botName}: ${error.message}`, 'ERROR');
        return { online: false, status: 'error' };
    }
}

// Reiniciar um bot específico
async function reiniciarBot(bot) {
    try {
        log(`Iniciando reinicialização: ${bot.name}`, 'RESTART');

        // 1. Criar sinal para bot notificar grupos
        await criarSinalPreRestart(bot);

        // 2. Aguardar bot enviar notificação
        log(`Aguardando ${TEMPO_AGUARDAR_NOTIFICACAO / 1000}s para bot notificar grupos...`, 'WAIT');
        await new Promise(resolve => setTimeout(resolve, TEMPO_AGUARDAR_NOTIFICACAO));

        // 3. Limpar cache
        await limparCache(bot);

        // 4. Reiniciar via PM2
        log(`Executando pm2 restart ${bot.name}...`, 'RESTART');
        await execPromise(`pm2 restart ${bot.name}`);

        // 5. Aguardar bot voltar online (5 minutos)
        log(`Aguardando ${TEMPO_ESPERA_REINICIO / 1000}s para o bot voltar online...`, 'WAIT');
        await new Promise(resolve => setTimeout(resolve, TEMPO_ESPERA_REINICIO));

        // 6. Aguardar estabilização e notificação (1 minuto)
        log(`Aguardando ${TEMPO_ESPERA_ESTABILIZACAO / 1000}s para estabilização...`, 'WAIT');
        await new Promise(resolve => setTimeout(resolve, TEMPO_ESPERA_ESTABILIZACAO));

        // 7. Verificar status
        const status = await verificarStatusBot(bot.name);
        if (status.online) {
            log(`Bot reiniciado com sucesso: ${bot.name} (Status: ${status.status})`, 'SUCCESS');
            return true;
        } else {
            log(`Bot não está online após reinicialização: ${bot.name} (Status: ${status.status})`, 'WARNING');
            return false;
        }

    } catch (error) {
        log(`Erro ao reiniciar ${bot.name}: ${error.message}`, 'ERROR');
        return false;
    }
}

// Reiniciar todos os bots sequencialmente
async function reiniciarTodosBots() {
    log('========================================', 'INFO');
    log('INICIANDO REINICIALIZAÇÃO SEQUENCIAL', 'INFO');
    log(`Total de bots: ${BOTS.length}`, 'INFO');
    log(`Tempo por bot: ~${(TEMPO_ESPERA_REINICIO + TEMPO_ESPERA_ESTABILIZACAO) / 60000} minutos`, 'INFO');
    log('========================================', 'INFO');

    const resultados = [];

    for (let i = 0; i < BOTS.length; i++) {
        const bot = BOTS[i];
        const numeroBot = i + 1;

        log(`\n[${numeroBot}/${BOTS.length}] Processando: ${bot.name}`, 'INFO');

        const sucesso = await reiniciarBot(bot);
        resultados.push({ bot: bot.name, sucesso });

        // Não há intervalo adicional - cada bot já aguarda 6 minutos internamente
        // (5min para reiniciar + 1min para estabilizar)
    }

    // Resumo final
    log('\n========================================', 'INFO');
    log('RESUMO DA REINICIALIZAÇÃO', 'INFO');
    log('========================================', 'INFO');

    const sucessos = resultados.filter(r => r.sucesso).length;
    const falhas = resultados.filter(r => !r.sucesso).length;

    resultados.forEach(r => {
        const status = r.sucesso ? '✅ SUCESSO' : '❌ FALHA';
        log(`${r.bot}: ${status}`, r.sucesso ? 'SUCCESS' : 'ERROR');
    });

    log(`\nTotal: ${sucessos} sucessos, ${falhas} falhas`, 'INFO');
    log('========================================\n', 'INFO');

    return { sucessos, falhas, resultados };
}

// === EXECUÇÃO PRINCIPAL ===
async function main() {
    try {
        const inicio = Date.now();

        const resultado = await reiniciarTodosBots();

        const tempoTotal = Math.round((Date.now() - inicio) / 1000);
        log(`Processo concluído em ${tempoTotal}s`, 'SUCCESS');

        // Exit code baseado nos resultados
        process.exit(resultado.falhas > 0 ? 1 : 0);

    } catch (error) {
        log(`Erro fatal no processo: ${error.message}`, 'ERROR');
        console.error(error);
        process.exit(1);
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { reiniciarTodosBots, reiniciarBot, limparCache };
