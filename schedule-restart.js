#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');

// === CONFIGURAÇÃO ===
const HORARIOS_RESTART = [
    { hora: 6, minuto: 0 },   // 06:00
    { hora: 12, minuto: 0 },  // 12:00
    { hora: 18, minuto: 0 },  // 18:00
    { hora: 20, minuto: 0 }   // 20:00
];
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
    let proximaExecucao = null;
    let menorDiferenca = Infinity;

    // Verificar todos os horários de hoje
    for (const horario of HORARIOS_RESTART) {
        const execucao = new Date();
        execucao.setHours(horario.hora);
        execucao.setMinutes(horario.minuto);
        execucao.setSeconds(0);
        execucao.setMilliseconds(0);

        // Se ainda não passou, calcular diferença
        if (execucao > agora) {
            const diferenca = execucao - agora;
            if (diferenca < menorDiferenca) {
                menorDiferenca = diferenca;
                proximaExecucao = execucao;
            }
        }
    }

    // Se não encontrou nenhum horário hoje, pegar o primeiro de amanhã
    if (!proximaExecucao) {
        const primeiroHorario = HORARIOS_RESTART[0];
        proximaExecucao = new Date();
        proximaExecucao.setDate(proximaExecucao.getDate() + 1);
        proximaExecucao.setHours(primeiroHorario.hora);
        proximaExecucao.setMinutes(primeiroHorario.minuto);
        proximaExecucao.setSeconds(0);
        proximaExecucao.setMilliseconds(0);
    }

    return proximaExecucao;
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
    log('Horários configurados:', 'INFO');
    HORARIOS_RESTART.forEach(h => {
        log(`  - ${String(h.hora).padStart(2, '0')}:${String(h.minuto).padStart(2, '0')}`, 'INFO');
    });
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
