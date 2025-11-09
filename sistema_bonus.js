const fs = require('fs').promises;
const path = require('path');

/**
 * Sistema de Gestão de Bônus
 * Baseado no sistema de pacotes automáticos
 * Garante persistência total dos dados de bônus
 */
class SistemaBonus {
    constructor() {
        console.log('💰 Inicializando Sistema de Bônus...');

        // Arquivos para persistir dados
        this.ARQUIVO_BONUS = path.join(__dirname, 'dados_bonus.json');
        this.ARQUIVO_SAQUES = path.join(__dirname, 'dados_saques.json');
        this.ARQUIVO_CODIGOS = path.join(__dirname, 'dados_codigos.json');
        this.ARQUIVO_REFERENCIAS = path.join(__dirname, 'dados_referencias.json');

        // Dados em memória
        this.bonusSaldos = {};        // cliente -> {saldo, historicoSaques, detalhesReferencias}
        this.pedidosSaque = {};       // referencia -> {cliente, quantidade, status, etc}
        this.codigosReferencia = {};  // codigo -> {dono, dataGeracao}
        this.referenciasClientes = {}; // cliente -> {convidadoPor, dataRegistro, etc}

        console.log('💰 Sistema de Bônus inicializado!');
    }

    // === CARREGAR DADOS PERSISTIDOS ===
    async carregarDados() {
        console.log('💰 Carregando dados de bônus...');
        console.log(`💰 Diretório: ${__dirname}`);
        console.log(`💰 Arquivo de bônus: ${this.ARQUIVO_BONUS}`);

        try {
            // Carregar saldos de bônus
            try {
                const dados = await fs.readFile(this.ARQUIVO_BONUS, 'utf8');
                console.log(`💰 Arquivo lido com sucesso (${dados.length} caracteres)`);

                // PROTEÇÃO: Arquivo vazio
                if (!dados || dados.trim().length === 0) {
                    console.log(`⚠️ Arquivo de bônus está VAZIO! Tentando restaurar backup...`);
                    await this.restaurarBackup(this.ARQUIVO_BONUS, 'bonus');
                    // Tentar ler novamente após restaurar
                    const dadosBackup = await fs.readFile(this.ARQUIVO_BONUS, 'utf8');
                    if (dadosBackup && dadosBackup.trim().length > 0) {
                        this.bonusSaldos = JSON.parse(dadosBackup);
                        console.log(`✅ Backup restaurado: ${Object.keys(this.bonusSaldos).length} saldos`);
                    } else {
                        console.log(`⚠️ Nenhum backup disponível - iniciando vazio`);
                        this.bonusSaldos = {};
                    }
                } else {
                    this.bonusSaldos = JSON.parse(dados);
                    console.log(`💰 ${Object.keys(this.bonusSaldos).length} saldos de bônus carregados`);

                    // Mostrar alguns saldos como exemplo
                    const exemplos = Object.entries(this.bonusSaldos).slice(0, 3);
                    if (exemplos.length > 0) {
                        console.log(`💰 Exemplos carregados:`);
                        exemplos.forEach(([cliente, dados]) => {
                            console.log(`   - ${cliente}: ${dados.saldo}MB`);
                        });
                    }
                }
            } catch (error) {
                console.log(`💰 Erro ao carregar saldos: ${error.message}`);
                console.log(`💰 Tentando restaurar backup...`);
                try {
                    await this.restaurarBackup(this.ARQUIVO_BONUS, 'bonus');
                    const dadosBackup = await fs.readFile(this.ARQUIVO_BONUS, 'utf8');
                    this.bonusSaldos = JSON.parse(dadosBackup);
                    console.log(`✅ Backup restaurado: ${Object.keys(this.bonusSaldos).length} saldos`);
                } catch (backupError) {
                    console.log(`⚠️ Nenhum backup disponível - iniciando vazio`);
                    this.bonusSaldos = {};
                }
            }

            // Carregar pedidos de saque
            try {
                const dados = await fs.readFile(this.ARQUIVO_SAQUES, 'utf8');
                this.pedidosSaque = JSON.parse(dados);
                console.log(`💰 ${Object.keys(this.pedidosSaque).length} pedidos de saque carregados`);
            } catch (error) {
                console.log(`💰 Nenhum pedido de saque encontrado - iniciando limpo`);
                this.pedidosSaque = {};
            }

            // Carregar códigos de referência
            try {
                const dados = await fs.readFile(this.ARQUIVO_CODIGOS, 'utf8');
                this.codigosReferencia = JSON.parse(dados);
                console.log(`💰 ${Object.keys(this.codigosReferencia).length} códigos de referência carregados`);
            } catch (error) {
                console.log(`💰 Nenhum código de referência encontrado - iniciando limpo`);
                this.codigosReferencia = {};
            }

            // Carregar referências de clientes
            try {
                const dados = await fs.readFile(this.ARQUIVO_REFERENCIAS, 'utf8');
                this.referenciasClientes = JSON.parse(dados);
                console.log(`💰 ${Object.keys(this.referenciasClientes).length} referências de clientes carregadas`);
            } catch (error) {
                console.log(`💰 Nenhuma referência de cliente encontrada - iniciando limpo`);
                this.referenciasClientes = {};
            }

            console.log('✅ Dados de bônus carregados com sucesso!');

        } catch (error) {
            console.error(`❌ BONUS: Erro ao carregar dados:`, error);
        }
    }

    // === SALVAR DADOS IMEDIATAMENTE ===
    async salvarDados() {
        try {
            console.log(`💾 BONUS: Salvando dados...`);

            // Log de estatísticas antes de salvar
            const numSaldos = Object.keys(this.bonusSaldos).length;
            const numSaques = Object.keys(this.pedidosSaque).length;
            const numCodigos = Object.keys(this.codigosReferencia).length;
            const numReferencias = Object.keys(this.referenciasClientes).length;

            console.log(`💾 ${numSaldos} saldos, ${numSaques} saques, ${numCodigos} códigos, ${numReferencias} referências`);

            // CRIAR BACKUPS antes de salvar (proteção contra corrupção)
            await this.criarBackups();

            // Preparar dados em JSON
            const jsonBonus = JSON.stringify(this.bonusSaldos, null, 2);
            const jsonSaques = JSON.stringify(this.pedidosSaque, null, 2);
            const jsonCodigos = JSON.stringify(this.codigosReferencia, null, 2);
            const jsonReferencias = JSON.stringify(this.referenciasClientes, null, 2);

            // VALIDAR que JSON não está vazio
            if (numSaldos > 0 && jsonBonus.length < 10) {
                console.error(`❌ ERRO CRÍTICO: JSON de bônus está vazio mas deveria ter ${numSaldos} saldos!`);
                console.error(`❌ ABORTANDO salvamento para não perder dados!`);
                return;
            }

            // Salvar todos os arquivos em paralelo (mais rápido)
            const resultados = await Promise.allSettled([
                fs.writeFile(this.ARQUIVO_BONUS, jsonBonus),
                fs.writeFile(this.ARQUIVO_SAQUES, jsonSaques),
                fs.writeFile(this.ARQUIVO_CODIGOS, jsonCodigos),
                fs.writeFile(this.ARQUIVO_REFERENCIAS, jsonReferencias)
            ]);

            // Verificar erros
            const nomeArquivos = ['BONUS', 'SAQUES', 'CODIGOS', 'REFERENCIAS'];
            const caminhos = [this.ARQUIVO_BONUS, this.ARQUIVO_SAQUES, this.ARQUIVO_CODIGOS, this.ARQUIVO_REFERENCIAS];
            let erros = 0;
            resultados.forEach((resultado, index) => {
                if (resultado.status === 'fulfilled') {
                    console.log(`   ✅ ${nomeArquivos[index]} salvo em ${caminhos[index]}`);
                } else {
                    console.error(`   ❌ ${nomeArquivos[index]} FALHOU:`, resultado.reason);
                    console.error(`   📁 Caminho: ${caminhos[index]}`);
                    erros++;
                }
            });

            if (erros === 0) {
                console.log(`✅ BONUS: Todos os dados salvos com sucesso!`);
            } else {
                console.error(`⚠️ BONUS: ${erros} arquivo(s) falharam ao salvar`);
            }

        } catch (error) {
            console.error(`❌ BONUS: Erro ao salvar dados:`, error);
            throw error; // Re-throw para quem chamou saber que falhou
        }
    }

    // === CRIAR BACKUPS ===
    async criarBackups() {
        try {
            const arquivos = [
                { original: this.ARQUIVO_BONUS, backup: this.ARQUIVO_BONUS + '.backup' },
                { original: this.ARQUIVO_SAQUES, backup: this.ARQUIVO_SAQUES + '.backup' },
                { original: this.ARQUIVO_CODIGOS, backup: this.ARQUIVO_CODIGOS + '.backup' },
                { original: this.ARQUIVO_REFERENCIAS, backup: this.ARQUIVO_REFERENCIAS + '.backup' }
            ];

            for (const { original, backup } of arquivos) {
                try {
                    // Verificar se arquivo original existe
                    await fs.access(original);
                    // Copiar para backup
                    await fs.copyFile(original, backup);
                } catch (error) {
                    // Arquivo original não existe, tudo bem
                }
            }
        } catch (error) {
            console.error(`⚠️ Erro ao criar backups:`, error.message);
        }
    }

    // === RESTAURAR BACKUP ===
    async restaurarBackup(arquivo, tipo) {
        try {
            const arquivoBackup = arquivo + '.backup';
            console.log(`🔄 Tentando restaurar ${tipo} de ${arquivoBackup}...`);

            // Verificar se backup existe
            await fs.access(arquivoBackup);

            // Copiar backup de volta para original
            await fs.copyFile(arquivoBackup, arquivo);

            console.log(`✅ Backup de ${tipo} restaurado com sucesso!`);
        } catch (error) {
            console.log(`⚠️ Nenhum backup de ${tipo} disponível`);
            throw error;
        }
    }

    // === BUSCAR SALDO DE BÔNUS ===
    buscarSaldo(clienteId) {
        // Tentar todos os formatos possíveis
        const formatos = [
            clienteId,
            clienteId.replace('@c.us', '@lid'),
            clienteId.replace('@lid', '@c.us')
        ];

        for (const formato of formatos) {
            if (this.bonusSaldos[formato]) {
                return this.bonusSaldos[formato];
            }
        }

        return null;
    }

    // === ATUALIZAR SALDO ===
    async atualizarSaldo(clienteId, callback) {
        // Buscar em todos os formatos
        let saldoObj = this.buscarSaldo(clienteId);

        // Se não existir, criar novo
        if (!saldoObj) {
            saldoObj = {
                saldo: 0,
                historicoSaques: [],
                detalhesReferencias: {}
            };
        }

        // Aplicar callback para modificar
        callback(saldoObj);

        // Salvar em todos os formatos (garantir compatibilidade)
        this.bonusSaldos[clienteId] = saldoObj;
        this.bonusSaldos[clienteId.replace('@c.us', '@lid')] = saldoObj;
        this.bonusSaldos[clienteId.replace('@lid', '@c.us')] = saldoObj;

        // Salvar imediatamente no disco
        await this.salvarDados();

        console.log(`💰 Saldo de ${clienteId} atualizado: ${saldoObj.saldo}MB`);
    }

    // === CRIAR PEDIDO DE SAQUE ===
    async criarPedidoSaque(referencia, cliente, nomeCliente, quantidade, numeroDestino, grupo) {
        const pedido = {
            referencia: referencia,
            cliente: cliente,
            nomeCliente: nomeCliente,
            quantidade: quantidade,
            numeroDestino: numeroDestino,
            dataSolicitacao: new Date().toISOString(),
            status: 'pendente',
            grupo: grupo
        };

        this.pedidosSaque[referencia] = pedido;

        // Salvar imediatamente
        await this.salvarDados();

        console.log(`💰 Pedido de saque criado: ${referencia}`);
        return pedido;
    }

    // === ATUALIZAR STATUS DO PEDIDO ===
    async atualizarStatusPedido(referencia, status, dadosAdicionais = {}) {
        if (!this.pedidosSaque[referencia]) {
            console.error(`❌ Pedido ${referencia} não encontrado`);
            return false;
        }

        this.pedidosSaque[referencia].status = status;

        // Adicionar dados extras (dataEnvio, erroDetalhes, etc)
        Object.assign(this.pedidosSaque[referencia], dadosAdicionais);

        // Salvar imediatamente
        await this.salvarDados();

        console.log(`💰 Status do pedido ${referencia} atualizado para: ${status}`);
        return true;
    }

    // === REMOVER PEDIDO ===
    async removerPedido(referencia) {
        if (this.pedidosSaque[referencia]) {
            delete this.pedidosSaque[referencia];

            // Salvar imediatamente
            await this.salvarDados();

            console.log(`💰 Pedido ${referencia} removido`);
            return true;
        }
        return false;
    }

    // === PROCESSAR BÔNUS DE COMPRA ===
    async processarBonusCompra(clienteId, megas) {
        // Buscar quem convidou este cliente
        let referencia = null;

        const formatos = [
            clienteId,
            clienteId.replace('@c.us', '@lid'),
            clienteId.replace('@lid', '@c.us')
        ];

        for (const formato of formatos) {
            if (this.referenciasClientes[formato]) {
                referencia = this.referenciasClientes[formato];
                break;
            }
        }

        if (!referencia || !referencia.convidadoPor) {
            return null; // Cliente não tem referência
        }

        const convidadorId = referencia.convidadoPor;

        // Verificar se já atingiu limite de 5 compras
        if (referencia.comprasRealizadas >= 5) {
            console.log(`💰 Cliente ${clienteId} já atingiu limite de 5 compras`);
            return null;
        }

        // Incrementar contador de compras
        referencia.comprasRealizadas = (referencia.comprasRealizadas || 0) + 1;

        // Atualizar em todos os formatos
        formatos.forEach(formato => {
            this.referenciasClientes[formato] = referencia;
        });

        // Adicionar 200MB ao convidador
        const bonusMB = 200;
        await this.atualizarSaldo(convidadorId, (saldoObj) => {
            saldoObj.saldo += bonusMB;

            // Atualizar detalhes da referência
            if (!saldoObj.detalhesReferencias) {
                saldoObj.detalhesReferencias = {};
            }

            if (!saldoObj.detalhesReferencias[clienteId]) {
                saldoObj.detalhesReferencias[clienteId] = {
                    nome: referencia.nomeConvidado || 'Cliente',
                    compras: 0,
                    bonusGanho: 0
                };
            }

            saldoObj.detalhesReferencias[clienteId].compras = referencia.comprasRealizadas;
            saldoObj.detalhesReferencias[clienteId].bonusGanho += bonusMB;
        });

        console.log(`💰 Bônus processado: ${bonusMB}MB para ${convidadorId} (compra #${referencia.comprasRealizadas} de ${clienteId})`);

        return {
            convidadorId,
            bonusMB,
            comprasRealizadas: referencia.comprasRealizadas
        };
    }

    // === ESTATÍSTICAS ===
    obterEstatisticas() {
        const totalClientes = Object.keys(this.bonusSaldos).length;
        const totalSaques = Object.keys(this.pedidosSaque).length;
        const saldoTotal = Object.values(this.bonusSaldos).reduce((sum, b) => sum + (b.saldo || 0), 0);

        return {
            totalClientes,
            totalSaques,
            saldoTotal,
            saldoMedio: totalClientes > 0 ? Math.round(saldoTotal / totalClientes) : 0
        };
    }
}

module.exports = SistemaBonus;
