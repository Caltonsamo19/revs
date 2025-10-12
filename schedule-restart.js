#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');

// === CONFIGURAÇÃO ===
const HORARIO_RESTART = { hora: 18, minuto: 0 }; // 18:00
const SCRIPT_RESTART = path.join(__dirname, 'restart-bots.js');

function log(mensagem, tipo = 'INFO') {
    const timestamp = new Date().toLocaleString('pt-BR');
    const emoji = {
        'INFO': 'ℹ️',
        'SUCCESS': '✅',
        'ERROR': '❌',
        'SCHEDULE': '⏰',
        'EXEC': '🚀'
    }[tipo] || 'ℹ️';

    console.log(`[${timestamp}] ${emoji} ${mensagem}`);
}

function calcularProximaExecucao() {
    const agora = new Date();
    const proxima = new Date();

    proxima.setHours(HORARIO_RESTART.hora);
    proxima.setMinutes(HORARIO_RESTART.minuto);
    proxima.setSeconds(0);
    proxima.setMilliseconds(0);

    // Se já passou da hora hoje, agendar para amanhã
    if (proxima <= agora) {
        proxima.setDate(proxima.getDate() + 1);
    }

    return proxima;
}

function calcularTempoRestante(proximaExecucao) {
    const agora = new Date();
    const diff = proximaExecucao - agora;

    const horas = Math.floor(diff / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return { milissegundos: diff, horas, minutos };
}

function executarReiniciacao() {
    log('Executando script de reinicialização...', 'EXEC');

    exec(`node ${SCRIPT_RESTART}`, (error, stdout, stderr) => {
        if (error) {
            log(`Erro ao executar reinicialização: ${error.message}`, 'ERROR');
            console.error(stderr);
        } else {
            console.log(stdout);
            log('Script de reinicialização concluído', 'SUCCESS');
        }

        // Agendar próxima execução
        agendarProximaExecucao();
    });
}

function agendarProximaExecucao() {
    const proxima = calcularProximaExecucao();
    const tempo = calcularTempoRestante(proxima);

    log(`Próxima reinicialização agendada para: ${proxima.toLocaleString('pt-BR')}`, 'SCHEDULE');
    log(`Tempo restante: ${tempo.horas}h ${tempo.minutos}min`, 'INFO');

    // Agendar timeout
    setTimeout(executarReiniciacao, tempo.milissegundos);
}

// === INICIALIZAÇÃO ===
function iniciar() {
    log('========================================', 'INFO');
    log('AGENDADOR DE REINICIALIZAÇÃO DE BOTS', 'INFO');
    log(`Horário configurado: ${HORARIO_RESTART.hora}:${String(HORARIO_RESTART.minuto).padStart(2, '0')}`, 'INFO');
    log('========================================', 'INFO');

    agendarProximaExecucao();

    log('Agendador iniciado com sucesso!', 'SUCCESS');
}

// Executar se chamado diretamente
if (require.main === module) {
    iniciar();

    // Manter o processo rodando
    process.on('SIGINT', () => {
        log('Encerrando agendador...', 'INFO');
        process.exit(0);
    });
}

module.exports = { iniciar };
