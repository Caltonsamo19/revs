const { OpenAI } = require("openai");
// Google Vision removido - processamento de imagens desativado

class WhatsAppAI {
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.comprovantesEmAberto = {};
    this.historicoMensagens = [];
    this.maxHistorico = 100; // OTIMIZADO: Reduzido de 200 para 100 mensagens

    // RATE LIMITING PARA OPENAI - OTIMIZADO
    this.rateLimiter = {
      requests: [],
      maxRequests: 80, // máximo 80 requests por minuto (aumentado de 10)
      windowMs: 60000 // janela de 1 minuto
    };
    
    // Processamento de imagens desativado para otimização
    this.googleVisionEnabled = false;
    
    // Limpeza automática a cada 10 minutos - SIMPLIFICADA
    setInterval(() => {
      this.limparComprovantesAntigos();
    }, 10 * 60 * 1000);
    
    console.log(`🧠 IA WhatsApp inicializada - Processamento apenas de TEXTO`);
  }

  // === RATE LIMITING PARA OPENAI ===
  async checkRateLimit() {
    const now = Date.now();

    // Limpar requests antigos
    this.rateLimiter.requests = this.rateLimiter.requests.filter(
      timestamp => now - timestamp < this.rateLimiter.windowMs
    );

    // Verificar se excedeu o limite
    if (this.rateLimiter.requests.length >= this.rateLimiter.maxRequests) {
      const oldestRequest = Math.min(...this.rateLimiter.requests);
      const waitTime = this.rateLimiter.windowMs - (now - oldestRequest);

      console.log(`⏳ Rate limit atingido, aguardando ${Math.round(waitTime/1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Registrar nova request
    this.rateLimiter.requests.push(now);
  }

  // === CALCULAR VALOR DE 10GB BASEADO NA TABELA DO GRUPO ===
  calcularValor10GB(tabelaPrecos) {
    try {
      if (!tabelaPrecos) {
        console.log(`⚠️ Tabela de preços não fornecida, usando valor padrão`);
        return 170; // Valor padrão: 10GB = 170MT
      }

      // Buscar padrões de 10GB ou 10240MB na tabela
      const patterns = [
        /10240\s*MB.*?(\d+)\s*MT/i,
        /10GB.*?(\d+)\s*MT/i,
        /10000\s*MB.*?(\d+)\s*MT/i,
        /(\d+)\s*MT.*?10240\s*MB/i,
        /(\d+)\s*MT.*?10GB/i
      ];

      for (const pattern of patterns) {
        const match = tabelaPrecos.match(pattern);
        if (match && match[1]) {
          const valor = parseFloat(match[1]);
          console.log(`✅ Valor de 10GB encontrado na tabela: ${valor}MT`);
          return valor;
        }
      }

      // Se não encontrar 10GB, calcular proporcionalmente baseado em 1GB
      const pattern1GB = /1024\s*MB.*?(\d+)\s*MT/i;
      const match1GB = tabelaPrecos.match(pattern1GB);

      if (match1GB && match1GB[1]) {
        const valor1GB = parseFloat(match1GB[1]);
        const valor10GB = valor1GB * 10;
        console.log(`💡 Valor de 10GB calculado proporcionalmente: ${valor10GB}MT (1GB=${valor1GB}MT × 10)`);
        return valor10GB;
      }

      console.log(`⚠️ Não foi possível encontrar valor de 10GB na tabela, usando padrão`);
      return 170; // Valor padrão

    } catch (error) {
      console.error(`❌ Erro ao calcular valor de 10GB:`, error.message);
      return 170; // Valor padrão em caso de erro
    }
  }

  // === DIVIDIR TRANSFERÊNCIA EM BLOCOS DE 10GB (VENDAS AVULSAS) ===
  dividirEmBlocos(referenciaOriginal, megasTotais, numeros, tabelaPrecos = null) {
    try {
      console.log(`🔧 DIVISÃO: Iniciando divisão de ${megasTotais}MB para ${numeros.length} número(s)`);

      const BLOCO_MAX = 10240; // 10GB em MB
      const megasPorNumero = Math.floor(megasTotais / numeros.length);

      console.log(`📊 Cada número receberá: ${megasPorNumero}MB`);

      // Calcular valor de 10GB baseado na tabela
      const valor10GB = this.calcularValor10GB(tabelaPrecos);

      const todosPedidos = [];
      let contadorSufixoGlobal = 0;

      // Para cada número, dividir seus megas em blocos
      for (let numIndex = 0; numIndex < numeros.length; numIndex++) {
        const numero = numeros[numIndex];
        const megasNumero = megasPorNumero;
        const numBlocos = Math.ceil(megasNumero / BLOCO_MAX);

        console.log(`📱 Número ${numIndex + 1}/${numeros.length} (${numero}): ${megasNumero}MB → ${numBlocos} blocos`);

        let megasRestantes = megasNumero;

        for (let i = 0; i < numBlocos; i++) {
          const megasBloco = Math.min(BLOCO_MAX, megasRestantes);

          // PRIMEIRA transação usa referência ORIGINAL (sem sufixo)
          // Demais usam sufixo 01, 02, 03...
          let referenciaBloco;
          if (contadorSufixoGlobal === 0) {
            referenciaBloco = referenciaOriginal;
          } else {
            const sufixo = String(contadorSufixoGlobal).padStart(2, '0');
            referenciaBloco = `${referenciaOriginal}${sufixo}`;
          }

          // Calcular valor proporcional
          const valorBloco = megasBloco === BLOCO_MAX
            ? valor10GB
            : (valor10GB * megasBloco / BLOCO_MAX).toFixed(2);

          todosPedidos.push({
            referencia: referenciaBloco,
            megas: megasBloco,
            numero: numero,
            valor: parseFloat(valorBloco)
          });

          megasRestantes -= megasBloco;
          contadorSufixoGlobal++;

          console.log(`   📦 Bloco ${contadorSufixoGlobal}: ${referenciaBloco} → ${megasBloco}MB → ${numero} (${valorBloco}MT)`);
        }
      }

      console.log(`✅ DIVISÃO CONCLUÍDA: ${todosPedidos.length} blocos no total`);

      return {
        sucesso: true,
        pedidos: todosPedidos,
        totalBlocos: todosPedidos.length,
        megasPorNumero: megasPorNumero,
        valorTotal: todosPedidos.reduce((sum, p) => sum + p.valor, 0)
      };

    } catch (error) {
      console.error(`❌ DIVISÃO: Erro ao dividir em blocos:`, error);
      return { sucesso: false, erro: error.message };
    }
  }

  // === RECONSTRUIR REFERÊNCIAS QUEBRADAS ===
  reconstruirReferenciasQuebradas(texto) {
    console.log('🔧 Reconstruindo referências quebradas...');
    
    // Padrões comuns de referências M-Pesa/E-Mola quebradas
    const padroes = [
      // PP250901.1250.B + 64186 = PP250901.1250.B64186
      {
        regex: /(PP\d{6}\.\d{4}\.B)\s*\n?\s*(\d{4,6})/gi,
        reconstruct: (match, p1, p2) => `${p1}${p2}`
      },
      // CHMOH4HICK + 2 = CHMOH4HICK2 (caso específico: referência + número isolado)
      {
        regex: /(CHMOH4HICK)\s*\n?\s*(\d+)/gi,
        reconstruct: (match, p1, p2) => `${p1}${p2}`
      },
      // Padrão genérico: CÓDIGO + número isolado = CÓDIGONÚMERO
      {
        regex: /([A-Z]{8,12}[A-Z])\s*\n?\s*(\d{1,3})(?=\s*\.|\s*\n|\s*$)/gi,
        reconstruct: (match, p1, p2) => `${p1}${p2}`
      },
      // CI6H85P + TN4 = CI6H85PTN4
      {
        regex: /([A-Z]\w{5,7}[A-Z])\s*\n?\s*([A-Z0-9]{2,4})/gi,
        reconstruct: (match, p1, p2) => `${p1}${p2}`
      },
      // CGC4GQ1 + 7W84 = CGC4GQ17W84
      {
        regex: /([A-Z]{3}\d[A-Z]{2}\d)\s*\n?\s*(\d?[A-Z0-9]{3,4})/gi,
        reconstruct: (match, p1, p2) => `${p1}${p2}`
      },
      // Confirmado + CÓDIGO = CÓDIGO (remover prefixos)
      {
        regex: /Confirmado\s*\n?\s*([A-Z0-9]{8,15})/gi,
        reconstruct: (match, p1) => p1
      },
      // ID genérico: XXXXX + XXXXX = XXXXXXXXXX
      {
        regex: /([A-Z0-9]{5,8})\s*\n?\s*([A-Z0-9]{3,6})/gi,
        reconstruct: (match, p1, p2) => {
          // Só juntar se parecer fazer sentido (não números aleatórios)
          if (/^[A-Z]/.test(p1) && (p1.length + p2.length >= 8 && p1.length + p2.length <= 15)) {
            return `${p1}${p2}`;
          }
          return match;
        }
      }
    ];

    let textoProcessado = texto;
    let alteracoes = 0;

    for (const padrao of padroes) {
      const matches = [...textoProcessado.matchAll(padrao.regex)];
      for (const match of matches) {
        const original = match[0];
        
        // Chamar função de reconstrução com todos os grupos capturados
        let reconstruido;
        if (match.length === 2) {
          // Apenas um grupo (ex: "Confirmado CODIGO")
          reconstruido = padrao.reconstruct(match[0], match[1]);
        } else {
          // Dois grupos (ex: "CODIGO1 CODIGO2")
          reconstruido = padrao.reconstruct(match[0], match[1], match[2]);
        }
        
        if (reconstruido !== original && reconstruido !== match[0]) {
          textoProcessado = textoProcessado.replace(original, reconstruido);
          console.log(`   🔧 Reconstruído: "${original.replace(/\n/g, '\\n')}" → "${reconstruido}"`);
          alteracoes++;
        }
      }
    }

    if (alteracoes > 0) {
      console.log(`✅ ${alteracoes} referência(s) reconstruída(s)`);
    } else {
      console.log(`ℹ️ Nenhuma referência quebrada detectada`);
    }

    return textoProcessado;
  }

  // === EXTRAIR VALOR CORRETO DO M-PESA ===
  extrairValorMPesa(texto) {
    // Procurar especificamente por "Transferiste X.XXMT"
    const padraoTransferiste = /Transferiste\s+(\d+(?:[.,]\d{1,2})?)\s*MT/i;
    const matchTransferiste = texto.match(padraoTransferiste);

    if (matchTransferiste) {
      const valor = matchTransferiste[1].replace(',', '.');
      console.log(`💰 Valor extraído via regex: ${valor}MT (Transferiste)`);
      return valor;
    }

    // Fallback: procurar outros padrões
    const padraoValor = /(?:pagou|enviou|valor|quantia)[\s:]+(\d+(?:[.,]\d{1,2})?)\s*MT/i;
    const matchValor = texto.match(padraoValor);

    if (matchValor) {
      const valor = matchValor[1].replace(',', '.');
      console.log(`💰 Valor extraído via regex: ${valor}MT (padrão geral)`);
      return valor;
    }

    return null;
  }

  // === EXTRAIR TEXTO COM GOOGLE VISION ===
  // === GOOGLE VISION REMOVIDO PARA OTIMIZAÇÃO ===
  // Processamento de imagens desativado

  // === INTERPRETAR COMPROVANTE COM GPT (TEXTO PURO) ===
  async interpretarComprovanteComGPT(textoExtraido) {
    console.log('🧠 Interpretando texto extraído com GPT-4...');
    
    const prompt = `
Analisa este texto extraído de um comprovante M-Pesa ou E-Mola de Moçambique:

"${textoExtraido}"

Procura por:
1. Referência da transação (exemplos: CGC4GQ17W84, PP250712.2035.u31398, etc.)
2. Valor transferido (em MT - Meticais)

INSTRUÇÕES IMPORTANTES:
- A REFERÊNCIA pode estar QUEBRADA em múltiplas linhas. Ex: "PP250901.1250.B" + "64186" = "PP250901.1250.B64186"
- RECONSTRÓI referências que estão separadas por quebras de linha
- Procura por "ID da transacao", "Confirmado", "Transferiste"
- Junta códigos que aparecem próximos e parecem ser parte da mesma referência
- O valor pode estar em formato "100.00MT", "100MT", "100,00MT"
- ATENÇÃO: Procura pelo valor após "Transferiste" - NÃO o saldo da conta!
- Exemplo: "Transferiste 17.00MT" = valor é 17.00, não o saldo mencionado depois

EXEMPLOS DE RECONSTRUÇÃO:
- Se vês "PP250901.1250.B" e depois "64186", a referência é "PP250901.1250.B64186"
- Se vês "CI6H85P" e depois "TN4", a referência é "CI6H85PTN4"
- Se vês "CHMOH4HICK" e depois "2", a referência é "CHMOH4HICK2"
- Se vês texto como "CODIGO\n2.\nTransferiste", junta "CODIGO2"

EXEMPLO REAL:
Texto: "ID da transacao PP250920.1335.y04068. Transferiste 17.00MT para conta 871112049... O saldo da tua conta e 1.00MT"
Resposta correta: {"referencia": "PP250920.1335.y04068", "valor": "17.00", "encontrado": true}
NOTA: O valor é 17.00MT (transferido), NÃO 1.00MT (saldo)!

Responde APENAS no formato JSON:
{
  "referencia": "PP250901.1250.B64186",
  "valor": "125.00",
  "encontrado": true
}

Se não conseguires extrair os dados:
{"encontrado": false}`;

    try {
      // Aplicar rate limiting
      await this.checkRateLimit();

      const resposta = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Você é especialista em analisar comprovantes de pagamento moçambicanos M-Pesa e E-Mola." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      console.log(`🔍 Resposta GPT para texto: ${resposta.choices[0].message.content}`);
      
      const resultado = this.extrairJSON(resposta.choices[0].message.content);
      console.log(`✅ JSON extraído do texto:`, resultado);

      // Verificar se o GPT extraiu o valor correto usando fallback de regex
      if (resultado.encontrado && resultado.valor) {
        const valorRegex = this.extrairValorMPesa(textoExtraido);
        console.log(`🔧 DEBUG: GPT extraiu valor: "${resultado.valor}", Regex encontrou: "${valorRegex}"`);

        if (valorRegex && parseFloat(valorRegex) !== parseFloat(resultado.valor)) {
          console.log(`⚠️ Correção de valor: GPT extraiu ${resultado.valor}MT, regex encontrou ${valorRegex}MT`);
          resultado.valor = valorRegex;
        }

        console.log(`✅ DEBUG: Valor final após verificação: "${resultado.valor}"`);
      }

      return resultado;

    } catch (error) {
      console.error('❌ Erro ao interpretar com GPT:', error.message);
      throw error;
    }
  }

  // === FUNÇÕES DE IMAGEM REMOVIDAS PARA OTIMIZAÇÃO ===
  // processarImagemHibrida, extrairTextoGoogleVision, etc. - REMOVIDAS

  // === VERIFICAR SE VALOR EXISTE NA TABELA ===
  verificarSeValorExisteNaTabela(valor, tabelaTexto) {
    const precos = this.extrairPrecosTabela(tabelaTexto);
    const valorNumerico = parseFloat(valor);
    
    if (precos.length === 0) {
      return { existe: false, motivo: 'tabela_vazia' };
    }
    
    // Procurar correspondência exata
    let pacoteExato = precos.find(p => p.preco === valorNumerico);
    
    // Se não encontrar exato, tentar com tolerância de ±1MT
    if (!pacoteExato) {
      pacoteExato = precos.find(p => Math.abs(p.preco - valorNumerico) <= 1);
    }
    
    if (pacoteExato) {
      return { existe: true };
    } else {
      return { 
        existe: false, 
        motivo: 'valor_nao_encontrado',
        precosDisponiveis: precos.map(p => `${p.preco}MT`).join(', ')
      };
    }
  }

  // === CALCULAR MEGAS POR VALOR ===
  calcularMegasPorValor(valor, tabelaTexto) {
    console.log(`   🧮 Calculando megas para ${valor}MT...`);

    const precos = this.extrairPrecosTabela(tabelaTexto);
    const valorNumerico = parseFloat(valor);

    // DEBUG: Mostrar todos os preços que correspondem ao valor buscado
    const precosCorrespondentes = precos.filter(p => p.preco === valorNumerico);
    if (precosCorrespondentes.length > 1) {
      console.log(`   ⚠️ DEBUG: Encontrados ${precosCorrespondentes.length} preços para ${valorNumerico}MT:`);
      precosCorrespondentes.forEach((p, i) => {
        console.log(`     ${i + 1}. ${p.descricao} = ${p.preco}MT (${p.quantidade}MB) - "${p.original}"`);
      });
    }

    // DEBUG removido para performance em modo silencioso

    if (precos.length === 0) {
      console.log(`   ❌ Nenhum preço encontrado na tabela, retornando valor numérico`);
      return valorNumerico;
    }

    // === VERIFICAÇÃO DE VALOR MÍNIMO ===
    // Encontrar o pacote mais barato da tabela
    const menorPreco = Math.min(...precos.map(p => p.preco));

    if (valorNumerico < menorPreco) {
      console.log(`   ❌ VALOR ABAIXO DO MÍNIMO: ${valorNumerico}MT < ${menorPreco}MT (pacote mais barato)`);
      // Retornar um valor especial que indique "valor muito baixo"
      return 'VALOR_MUITO_BAIXO';
    }
    
    // Procurar correspondência exata - PRIORIZAR MAIOR QUANTIDADE SE MÚLTIPLAS CORRESPONDÊNCIAS
    let correspondenciasExatas = precos.filter(p => p.preco === valorNumerico);
    let pacoteExato = null;

    if (correspondenciasExatas.length > 0) {
      // Se há múltiplas correspondências, pegar a com maior quantidade (mais provável de estar correta)
      pacoteExato = correspondenciasExatas.sort((a, b) => b.quantidade - a.quantidade)[0];
      console.log(`   ✅ Correspondência exata: ${valorNumerico}MT = ${pacoteExato.descricao} (${pacoteExato.quantidade}MB)`);
      return pacoteExato.quantidade; // Retorna em MB
    }

    // NOVA FUNCIONALIDADE: Se não encontrar correspondência, procurar o maior pacote que caiba no valor pago
    console.log(`   🔍 Valor ${valorNumerico}MT não encontrado, procurando maior pacote que caiba no valor...`);

    // Filtrar pacotes que custam MENOS OU IGUAL ao valor pago e ordenar por preço (maior primeiro)
    const pacotesValidos = precos
      .filter(p => p.preco <= valorNumerico)
      .sort((a, b) => b.preco - a.preco); // Ordenar do maior para o menor preço

    if (pacotesValidos.length > 0) {
      const melhorPacote = pacotesValidos[0]; // O mais caro que caiba no valor
      console.log(`   💡 OTIMIZADO: Cliente paga ${valorNumerico}MT → Enviando pacote de ${melhorPacote.preco}MT = ${melhorPacote.descricao} (${melhorPacote.quantidade}MB)`);
      return melhorPacote.quantidade; // Retorna em MB
    }

    // Se não encontrar nenhum pacote que caiba, retornar valor numérico como fallback
    console.log(`   ⚠️ Nenhum pacote encontrado para ${valorNumerico}MT, retornando valor numérico`);
    console.log(`   📋 Preços disponíveis: ${precos.map(p => `${p.preco}MT=${p.descricao}`).join(', ')}`);
    return valorNumerico;
  }

  // === EXTRAIR PREÇOS DA TABELA ===
  extrairPrecosTabela(tabelaTexto) {
    // console.log(`   📋 Extraindo preços da tabela...`);
    
    const precos = [];
    const linhas = tabelaTexto.split('\n');
    
    for (const linha of linhas) {
      // Verificar se a linha tem formato com bônus PRIMEIRO
      const formatoBonusMatch = /(\d+)\s*\+\s*\d+MB\s*[💎➔→\-_\s]*\s*(\d+(?:[,.]\d+)?)\s*MT/gi.exec(linha);

      if (formatoBonusMatch) {
        // Processar formato com bônus (considera apenas valor principal)
        const quantidade = parseFloat(formatoBonusMatch[1]);
        const preco = this.limparValorNumerico(formatoBonusMatch[2]);

        console.log(`     🎁 Formato com bônus: ${quantidade}MB (principal) = ${preco}MT`);

        precos.push({
          quantidade: quantidade,
          preco: preco,
          descricao: `${quantidade}MB`,
          tipo: 'diario',
          original: linha.trim()
        });

        continue; // Pular outros padrões para esta linha
      }

      // Padrões MELHORADOS para detectar preços - VERSÃO ROBUSTA (bônus já processado acima)
      const padroes = [
        // Formato: 1024MB 💎 16MT💵💽
        /(\d+)MB\s*[💎➔→\-_\s]*\s*(\d+(?:[,.]\d+)?)\s*MT/gi,
        // Formato: 12.8GB 💎 250MT💵💽
        /(\d+\.\d+)GB\s*[💎➔→\-_\s]*\s*(\d+(?:[,.]\d+)?)\s*MT/gi,
        // Formato: 1G + 200MB ➔ 20MT 📶
        /(\d+)G\s*[+]?\s*\d*MB?\s*[➔→\-]*\s*(\d+)\s*MT/gi,
        // Formato: 📲 5G ➔ 150MT 💳
        /📲\s*(\d+)G\s*[➔→\-]*\s*(\d+)\s*MT/gi,
        // Formato: 1024MB - 17,00 MT
        /(\d+)MB\s*[\-_]*\s*(\d+[,.]\d+)\s*MT/gi,
        // Formato: 1.7GB - 45,00MT
        /(\d+\.\d+)GB\s*[\-_]*\s*(\d+[,.]\d+)\s*MT/gi,
        // Formato: 𝟭024M𝗕__𝟭𝟴 𝗠𝗧 (caracteres especiais)
        /[𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵𝟬]+(\d*)M[𝗕B]?[_\s]*([𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵𝟬]+)\s*[𝗠M]?[𝗧T]/gi,
        // Formato: 🛜512MB = 10MT
        /🛜(\d+)MB\s*=\s*(\d+)MT/gi,
        // Formato: 🛜2.9GB = 85MT
        /🛜(\d+\.\d+)GB\s*=\s*(\d+)MT/gi,
        // Formato: 📊2.8GB = 95MT
        /📊(\d+\.\d+)GB\s*=\s*(\d+)MT/gi,
        // Formato: 450MT - Ilimitado + 11.5GB
        /(\d+)MT\s*[-=]\s*.*?\+\s*(\d+\.?\d*)GB/gi,
        // Formato genérico: número + unidade + preço
        /(\d+(?:\.\d+)?)\s*(MB|GB|G)\s*[\s\-=_💎➔→+]*\s*(\d+(?:[,.]\d+)?)\s*MT/gi,
        // Formato: 45𝗠𝗧__1741M𝗕 (formato reverso)
        /(\d+)\s*[𝗠𝗧MT]?[_\s]*[+-]?\s*(\d+)M[𝗕B]/gi,
        // Formato: 80𝗠𝗧__2970M𝗕 (formato reverso)
        /(\d+)\s*[𝗠𝗧MT]?[_\s]*[+-]?\s*(\d+\.?\d*)M[𝗕B]/gi
      ];
      
      for (const [index, padrao] of padroes.entries()) {
        let match;
        while ((match = padrao.exec(linha)) !== null) {
          let quantidade, preco, unidade = '';
          
          // console.log(`     🔍 Padrão ${index}: ${match[0]}`);
          
          // Detectar formato especial reverso (45MT__1741MB)
          if (index >= 12) { // Padrões reversos (índices ajustados)
            preco = this.limparValorNumerico(match[1]);
            quantidade = parseFloat(match[2]);
            unidade = 'mb';
            // console.log(`     🔄 Formato reverso: ${preco}MT -> ${quantidade}MB`);
          } else if (index === 7 || index === 8) { // Formatos 🛜 (MB=MT ou GB=MT) - índices ajustados
            // Para 🛜5120MB = 90MT: quantidade=5120MB, preco=90MT
            quantidade = parseFloat(match[1]);
            preco = this.limparValorNumerico(match[2]);
            unidade = index === 7 ? 'mb' : 'gb';
            console.log(`     🛜 Formato específico: ${quantidade}${unidade.toUpperCase()} = ${preco}MT`);
          } else if (index === 10) { // Formato: 450MT - Ilimitado + 11.5GB (índice ajustado)
            preco = this.limparValorNumerico(match[1]);
            quantidade = parseFloat(match[2]);
            unidade = 'gb';
            console.log(`     📞 Formato ilimitado: ${preco}MT -> ${quantidade}GB`);
          } else {
            // Formato normal (1024MB = 18MT)
            quantidade = parseFloat(match[1]);
            if (match[3]) { // Tem unidade no meio
              unidade = match[2].toLowerCase();
              preco = this.limparValorNumerico(match[3]);
            } else {
              preco = this.limparValorNumerico(match[2]);
            }
            // console.log(`     ℹ️ Formato normal: ${quantidade} ${unidade} -> ${preco}MT`);
          }
          
          // Skip se dados inválidos
          if (!quantidade || !preco || isNaN(quantidade) || isNaN(preco) || quantidade <= 0 || preco <= 0) {
            // console.log(`     ⚠️ Dados inválidos ignorados: q=${quantidade}, p=${preco}`);
            continue;
          }
          
          // Determinar unidade e converter para MB
          let quantidadeMB = quantidade;
          let descricao = '';
          
          // Detectar unidade da linha ou do match
          const linhaLower = linha.toLowerCase();
          const temGB = linhaLower.includes('gb') || linhaLower.includes('giga') || unidade === 'gb' || unidade === 'g';
          const temMB = linhaLower.includes('mb') || linhaLower.includes('mega') || unidade === 'mb' || unidade === 'm';
          
          if (temGB) {
            quantidadeMB = quantidade * 1024;
            descricao = `${quantidade}GB`;
          } else if (temMB) {
            quantidadeMB = quantidade;
            descricao = `${quantidade}MB`;
          } else if (linha.includes('💫')) {
            descricao = `${quantidade} Saldo`;
            quantidadeMB = 0;
          } else {
            // Heurística: se quantidade > 100, provavelmente é MB, senão GB
            if (quantidade >= 100) {
              quantidadeMB = quantidade;
              descricao = `${quantidade}MB`;
            } else {
              quantidadeMB = quantidade * 1024;
              descricao = `${quantidade}GB`;
            }
          }
          
          // Determinar tipo de pacote
          let tipo = 'diario';
          if (linhaLower.includes('mensal') || linhaLower.includes('30 dias')) {
            tipo = 'mensal';
          } else if (linhaLower.includes('semanal') || linhaLower.includes('7 dias')) {
            tipo = 'semanal';
          } else if (linhaLower.includes('diamante')) {
            tipo = 'diamante';
          } else if (linha.includes('💫')) {
            tipo = 'saldo';
          }
          
          // console.log(`     ✅ Processado: ${descricao} = ${preco}MT (${quantidadeMB}MB, ${tipo})`);
          
          precos.push({
            quantidade: quantidadeMB,
            preco: preco,
            descricao: descricao,
            tipo: tipo,
            original: linha.trim()
          });
        }
      }
    }
    
    // Remover duplicatas e ordenar por preço
    const precosUnicos = precos.filter((preco, index, self) => 
      index === self.findIndex(p => p.preco === preco.preco && p.quantidade === preco.quantidade)
    ).sort((a, b) => a.preco - b.preco);
    
    console.log(`   ✅ Preços extraídos: ${precosUnicos.length} pacotes encontrados`);
    
    // Debug: mostrar preços encontrados
    if (precosUnicos.length > 0) {
      // console.log(`   📋 Preços detectados:`);
      // precosUnicos.forEach((p, i) => {
      //   console.log(`     ${i+1}. ${p.descricao} = ${p.preco}MT (${p.tipo})`);
      // });
    }
    
    return precosUnicos;
  }

  // === LIMPAR VALOR NUMÉRICO (NOVA FUNÇÃO) ===
  limparValorNumerico(valor) {
    if (!valor) return 0;
    
    // Remover caracteres especiais de fonte estética (bold/italic unicode)
    let valorStr = valor.toString()
      .replace(/[𝟎𝟏𝟐𝟑𝟒𝟓𝟔𝟕𝟖𝟵]/g, (match) => {
        // Converter números especiais para normais
        const offset = match.charCodeAt(0) - 0x1D7EC;
        return String.fromCharCode(48 + offset);
      })
      .replace(/[𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭]/g, (match) => {
        // Converter letras especiais para normais  
        const offset = match.charCodeAt(0) - 0x1D5D4;
        return String.fromCharCode(65 + offset);
      })
      .replace(/[^\d.,]/g, '') // Manter apenas dígitos, vírgula e ponto
      .replace(/,/g, '.'); // Converter vírgula para ponto
    
    const numero = parseFloat(valorStr);
    return isNaN(numero) ? 0 : numero;
  }

  // === FUNÇÃO AUXILIAR PARA NORMALIZAR NÚMEROS ===
  normalizarNumero(numeroString) {
    // Remove espaços, hífens, pontos e + do número
    let numeroLimpo = numeroString.replace(/[\s\-\.+]/g, '');

    // Remove código de país 258 se presente (em qualquer posição no início)
    // Suporta formatos como: 258852118624, 258 852 118 624, +258852118624
    numeroLimpo = numeroLimpo.replace(/^258/, '');

    // Retorna apenas se for um número válido de 9 dígitos começando com 8
    if (/^8[0-9]{8}$/.test(numeroLimpo)) {
      return numeroLimpo;
    }

    // Se não conseguiu normalizar, tentar extrair apenas os 9 últimos dígitos se começar com 8
    const match = numeroLimpo.match(/8[0-9]{8}/);
    if (match) {
      return match[0];
    }

    return null;
  }

  // === FUNÇÃO MELHORADA PARA EXTRAIR NÚMEROS DE LEGENDAS ===
  extrairNumerosDeLegenda(legendaImagem) {
    console.log(`   🔍 LEGENDA: Analisando "${legendaImagem}"`);

    if (!legendaImagem || typeof legendaImagem !== 'string' || legendaImagem.trim().length === 0) {
      console.log(`   ❌ LEGENDA: Vazia ou inválida`);
      return [];
    }

    // Limpar a legenda de forma mais robusta
    let legendaLimpa = legendaImagem
      .replace(/[📱📲📞☎️🔢💳🎯🤖✅❌⏳💰📊💵📋⚡]/g, ' ') // Remover emojis comuns
      .replace(/\s+/g, ' ') // Normalizar espaços
      .trim();

    // console.log(`   📝 LEGENDA: Limpa "${legendaLimpa}"`);

    // NOVOS PADRÕES DE DETECÇÃO:
    // 1. Números com espaços: 85 211 8624 ou 848 715 208
    // 2. Números com +258: +258852118624 ou +258 85 211 8624
    // 3. Números com 258: 25852118624 ou 258 85 211 8624
    // 4. Números normais: 852118624
    const padroes = [
      /(?:\+?\s*258\s*)?8\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]/g,  // 258 8 5 2 1 1 8 6 2 4 ou 8 5 2 1 1 8 6 2 4
      /\+?\s*258\s*8[0-9]\s*[0-9]{3}\s*[0-9]{4}/g,           // +258 85 211 8624 (com espaços variados)
      /(?<!\d)\+?258\s*8[0-9]{8}(?!\d)/g,                    // +258852118624 ou 258852118624 (junto)
      /\b8[0-9]\s*[0-9]{3}\s*[0-9]{4}\b/g,                   // 85 211 8624 (com espaços variados)
      /\b8[0-9]{8}\b/g                                        // 852118624 (padrão normal)
    ];

    const numerosEncontrados = [];

    for (const padrao of padroes) {
      const matches = legendaLimpa.match(padrao);
      if (matches) {
        numerosEncontrados.push(...matches);
      }
    }
    
    if (numerosEncontrados.length === 0) {
      console.log(`   ❌ LEGENDA: Nenhum número encontrado`);
      return [];
    }

    console.log(`   📱 LEGENDA: Números brutos encontrados: ${numerosEncontrados.join(', ')}`);

    // Normalizar todos os números encontrados
    const numerosNormalizados = new Set();
    for (const numeroRaw of numerosEncontrados) {
      const numeroNormalizado = this.normalizarNumero(numeroRaw);
      if (numeroNormalizado) {
        numerosNormalizados.add(numeroNormalizado);
      }
    }

    const numerosValidos = [];

    for (const numero of numerosNormalizados) {
      // Procurar o número original na legenda para análise de contexto
      const posicao = legendaLimpa.indexOf(numero);
      const comprimentoLegenda = legendaLimpa.length;
      
      // Análise de número removida para privacidade
      
      // Contexto antes e depois do número
      const contextoBefore = legendaLimpa.substring(Math.max(0, posicao - 30), posicao).toLowerCase();
      const contextoAfter = legendaLimpa.substring(posicao + numero.length, posicao + numero.length + 30).toLowerCase();
      const contextoCompleto = (contextoBefore + contextoAfter).toLowerCase();
      
      console.log(`   📖 LEGENDA: Contexto antes: "${contextoBefore}"`);
      console.log(`   📖 LEGENDA: Contexto depois: "${contextoAfter}"`);
      
      // PALAVRAS QUE INDICAM NÚMERO DE PAGAMENTO (REJEITAR)
      const indicadoresPagamento = [
        'transferiste', 'para o número', 'para número', 'para conta',
        'beneficiário', 'destinatario', 'nome:', 'mpesa:', 'emola:',
        'pagar para', 'enviou para', 'taxa foi', 'conta de'
      ];
      
      // PALAVRAS QUE INDICAM NÚMERO DE DESTINO (ACEITAR)
      const indicadoresDestino = [
        'para receber', 'manda para', 'enviar para', 'envia para',
        'ativar para', 'activar para', 'este número', 'este numero',
        'número:', 'numero:', 'megas para', 'dados para', 'comprovante'
      ];
      
      // PADRÕES ESPECÍFICOS PARA LEGENDAS
      const padroesTipicos = [
        new RegExp(`comprovante\\s*${numero}`, 'i'),
        new RegExp(`${numero}\\s*comprovante`, 'i'),
        new RegExp(`numero\\s*${numero}`, 'i'),
        new RegExp(`${numero}\\s*numero`, 'i'),
        new RegExp(`^${numero}$`, 'i'), // Número isolado
        new RegExp(`${numero}\\s*$`, 'i'), // Número no final
        new RegExp(`^\\s*${numero}`, 'i') // Número no início
      ];
      
      // Verificar indicadores
      const eNumeroPagamento = indicadoresPagamento.some(indicador => 
        contextoCompleto.includes(indicador)
      );
      
      const eNumeroDestino = indicadoresDestino.some(indicador => 
        contextoCompleto.includes(indicador)
      );
      
      const temPadraoTipico = padroesTipicos.some(padrao => 
        padrao.test(legendaLimpa)
      );
      
      // NOVA LÓGICA: Verificar se está no final da legenda (mais provável ser destino)
      const percentualPosicao = (posicao / comprimentoLegenda) * 100;
      const estaNofinal = percentualPosicao > 70; // Últimos 30% da legenda
      
      console.log(`   📊 LEGENDA: Está no final (>70%): ${estaNofinal} (${percentualPosicao.toFixed(1)}%)`);
      console.log(`   📊 LEGENDA: É número de pagamento: ${eNumeroPagamento}`);
      console.log(`   📊 LEGENDA: É número de destino: ${eNumeroDestino}`);
      console.log(`   📊 LEGENDA: Tem padrão típico: ${temPadraoTipico}`);
      
      // LÓGICA DE DECISÃO MELHORADA PARA LEGENDAS
      if (eNumeroDestino || temPadraoTipico) {
        numerosValidos.push(numero);
        console.log(`   ✅ LEGENDA: Número aceito por contexto`);
      } else if (eNumeroPagamento) {
        console.log(`   ❌ LEGENDA: Número rejeitado (pagamento)`);
      } else if (estaNofinal) {
        // Se está no final e não é claramente pagamento, assumir destino
        numerosValidos.push(numero);
        console.log(`   ✅ LEGENDA: Número aceito (final)`);
      } else {
        // Para legendas, ser mais permissivo que mensagens de texto
        numerosValidos.push(numero);
        console.log(`   ✅ LEGENDA: Número aceito (padrão)`);
      }
    }
    
    // Remover duplicatas
    const numerosUnicos = [...new Set(numerosValidos)];
    // console.log(`   📱 LEGENDA: Números válidos finais: ${numerosUnicos.join(', ')}`);
    
    return numerosUnicos;
  }

  // === EXTRAIR NÚMEROS DE TEXTO (MELHORADO) ===
  extrairTodosNumeros(mensagem) {
    // console.log(`   🔍 TEXTO: Extraindo números da mensagem...`);

    if (!mensagem || typeof mensagem !== 'string') {
      console.log(`   ❌ TEXTO: Mensagem inválida`);
      return [];
    }

    // NOVOS PADRÕES DE DETECÇÃO (mesmos da legenda):
    // 1. Números com espaços: 85 211 8624 ou 848 715 208
    // 2. Números com +258: +258852118624 ou +258 85 211 8624
    // 3. Números com 258: 25852118624 ou 258 85 211 8624
    // 4. Números normais: 852118624
    const padroes = [
      /(?:\+?\s*258\s*)?8\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]/g,  // 258 8 5 2 1 1 8 6 2 4 ou 8 5 2 1 1 8 6 2 4
      /\+?\s*258\s*8[0-9]\s*[0-9]{3}\s*[0-9]{4}/g,           // +258 85 211 8624 (com espaços variados)
      /(?<!\d)\+?258\s*8[0-9]{8}(?!\d)/g,                    // +258852118624 ou 258852118624 (junto)
      /\b8[0-9]\s*[0-9]{3}\s*[0-9]{4}\b/g,                   // 85 211 8624 (com espaços variados)
      /\b8[0-9]{8}\b/g                                        // 852118624 (padrão normal)
    ];

    const numerosEncontrados = [];

    for (const padrao of padroes) {
      const matches = mensagem.match(padrao);
      if (matches) {
        numerosEncontrados.push(...matches);
      }
    }

    if (numerosEncontrados.length === 0) {
      console.log(`   ❌ TEXTO: Nenhum número encontrado`);
      return [];
    }

    console.log(`   📱 TEXTO: Números brutos encontrados: ${numerosEncontrados.join(', ')}`);

    // Normalizar todos os números encontrados
    const numerosNormalizados = new Set();
    for (const numeroRaw of numerosEncontrados) {
      const numeroNormalizado = this.normalizarNumero(numeroRaw);
      if (numeroNormalizado) {
        numerosNormalizados.add(numeroNormalizado);
      }
    }

    const numerosValidos = [];

    for (const numero of numerosNormalizados) {
      const posicao = mensagem.indexOf(numero);
      const tamanhoMensagem = mensagem.length;
      const percentualPosicao = (posicao / tamanhoMensagem) * 100;
      
      // console.log(`   🔍 TEXTO: Analisando ${numero} na posição ${posicao}/${tamanhoMensagem} (${percentualPosicao.toFixed(1)}%)`);
      
      const contextoBefore = mensagem.substring(Math.max(0, posicao - 50), posicao).toLowerCase();
      const contextoAfter = mensagem.substring(posicao + numero.length, posicao + numero.length + 50).toLowerCase();
      
      // PALAVRAS QUE INDICAM NÚMERO DE PAGAMENTO (IGNORAR)
      const indicadoresPagamento = [
        'transferiste', 'taxa foi', 'para o número', 'para número', 'para conta',
        'conta de', 'beneficiário', 'destinatario', 'nome:', 'para 8'
      ];
      
      // PALAVRAS QUE INDICAM NÚMERO DE DESTINO (USAR)
      const indicadoresDestino = [
        'megas para', 'manda para', 'enviar para', 'envia para', 
        'ativar para', 'este número', 'este numero', 'receber',
        'activar para', 'ativa para', 'para receber'
      ];
      
      const eNumeroPagamento = indicadoresPagamento.some(indicador => 
        contextoBefore.includes(indicador)
      );
      
      const eNumeroDestino = indicadoresDestino.some(indicador => {
        const contextoCompleto = contextoBefore + contextoAfter;
        return contextoCompleto.includes(indicador);
      });
      
      // LÓGICA ESPECIAL: Número isolado no final da mensagem
      const estaNofinalAbsoluto = posicao > tamanhoMensagem * 0.8;
      const contextoAposFinal = contextoAfter.trim();
      const estaIsoladoNoFinal = estaNofinalAbsoluto && (contextoAposFinal === '' || contextoAposFinal.length < 10);
      
      // console.log(`   📊 TEXTO: No final absoluto (>80%): ${estaNofinalAbsoluto}`);
      // console.log(`   📊 TEXTO: Isolado no final: ${estaIsoladoNoFinal}`);
      // console.log(`   📊 TEXTO: É pagamento: ${eNumeroPagamento}`);
      // console.log(`   📊 TEXTO: É destino: ${eNumeroDestino}`);
      
      if (eNumeroDestino) {
        numerosValidos.push(numero);
        console.log(`   ✅ TEXTO: Número aceito (destino)`);
      } else if (eNumeroPagamento) {
        // console.log(`   ❌ TEXTO: REJEITADO por ser pagamento: ${numero}`);
      } else if (estaIsoladoNoFinal) {
        numerosValidos.push(numero);
        console.log(`   ✅ TEXTO: Número aceito (isolado)`);
      } else if (estaNofinalAbsoluto && !eNumeroPagamento) {
        numerosValidos.push(numero);
        console.log(`   ✅ TEXTO: Número aceito (final)`);
      } else {
        // console.log(`   ❌ TEXTO: REJEITADO por ser ambíguo: ${numero}`);
      }
    }
    
    // Remover duplicatas
    const numerosUnicos = [...new Set(numerosValidos)];
    // console.log(`   📱 TEXTO: Números válidos finais: ${numerosUnicos.join(', ')}`);
    
    return numerosUnicos;
  }

  // === SEPARAR COMPROVANTE E NÚMEROS (CORRIGIDO) ===
  separarComprovanteENumeros(mensagem, ehLegenda = false) {
    // console.log(`   🔍 Separando comprovante e números ${ehLegenda ? '(LEGENDA)' : '(TEXTO)'}...`);
    
    if (!mensagem || typeof mensagem !== 'string') {
      console.log(`   ❌ Mensagem inválida para separação`);
      return { textoComprovante: '', numeros: [] };
    }
    
    // Usar função específica para legendas
    const numeros = ehLegenda ? 
      this.extrairNumerosDeLegenda(mensagem) : 
      this.extrairTodosNumeros(mensagem);
    
    // Criar texto do comprovante removendo números e contexto
    let textoComprovante = mensagem;
    
    for (const numero of numeros) {
      // Remover o número e possível contexto ao redor
      const padroes = [
        new RegExp(`\\s*megas? para\\s*${numero}\\s*`, 'gi'),
        new RegExp(`\\s*manda para\\s*${numero}\\s*`, 'gi'),
        new RegExp(`\\s*envia para\\s*${numero}\\s*`, 'gi'),
        new RegExp(`\\s*enviar para\\s*${numero}\\s*`, 'gi'),
        new RegExp(`\\s*este\\s+número\\s*${numero}\\s*`, 'gi'),
        new RegExp(`\\s*número\\s*${numero}\\s*`, 'gi'),
        new RegExp(`\\s*numero\\s*${numero}\\s*`, 'gi'),
        new RegExp(`\\s*comprovante\\s*${numero}\\s*`, 'gi'),
        new RegExp(`\\s*${numero}\\s*`, 'gi'), // Número no final
        new RegExp(`\\s+${numero}\\s*`, 'gi') // Número com espaços
      ];
      
      for (const padrao of padroes) {
        textoComprovante = textoComprovante.replace(padrao, ' ');
      }
    }
    
    // Limpar espaços extras
    textoComprovante = textoComprovante.replace(/\s+/g, ' ').trim();
    
    console.log(`   📄 Texto do comprovante processado`);
    console.log(`   📱 Números extraídos: ${numeros.length}`);
    
    return {
      textoComprovante: textoComprovante,
      numeros: numeros
    };
  }

  // === ANALISAR DIVISÃO AUTOMÁTICA ===
  async analisarDivisaoAutomatica(valorPago, configGrupo) {
    console.log(`   🧮 Analisando divisão automática para ${valorPago}MT...`);
    
    try {
      const precos = this.extrairPrecosTabela(configGrupo.tabela);
      
      if (precos.length === 0) {
        console.log(`   ❌ Nenhum preço encontrado na tabela do grupo`);
        return { deveDividir: false, motivo: 'Não foi possível extrair preços da tabela' };
      }
      
      const valorNumerico = parseFloat(valorPago);
      
      // Verificar se o valor é exatamente um pacote
      const pacoteExato = precos.find(p => p.preco === valorNumerico);
      if (pacoteExato) {
        console.log(`   ⚡ Valor exato para: ${pacoteExato.descricao}`);
        return { deveDividir: false, motivo: `Valor corresponde exatamente a ${pacoteExato.descricao}` };
      }
      
      // Tentar encontrar divisões otimizadas
      const divisoes = this.encontrarMelhoresDivisoes(valorNumerico, precos);
      
      if (divisoes.length > 0) {
        const melhorDivisao = divisoes[0];
        
        if (melhorDivisao.pacotes.length > 1 && melhorDivisao.valorRestante <= 15) {
          console.log(`   ✅ Divisão encontrada: ${melhorDivisao.descricao}`);
          
          return {
            deveDividir: true,
            pacotes: melhorDivisao.pacotes,
            valorTotalUsado: melhorDivisao.valorUsado,
            valorRestante: melhorDivisao.valorRestante,
            divisaoCompleta: melhorDivisao.descricao,
            mensagemCliente: `Detectei que seu valor de ${valorPago}MT pode ser dividido em: ${melhorDivisao.descricao}. Envie os números para ativação!`,
            motivo: 'Divisão otimizada encontrada'
          };
        }
      }
      
      console.log(`   ❌ Nenhuma divisão eficiente encontrada`);
      return { 
        deveDividir: false, 
        motivo: 'Não foi possível encontrar divisão eficiente com os preços disponíveis'
      };
      
    } catch (error) {
      console.error('❌ Erro ao analisar divisão automática:', error);
      return { deveDividir: false, motivo: 'Erro na análise' };
    }
  }

  // === ENCONTRAR MELHORES DIVISÕES ===
  encontrarMelhoresDivisoes(valorTotal, precos) {
    console.log(`   🔍 Procurando divisões para ${valorTotal}MT...`);
    
    const divisoes = [];
    
    const encontrarCombinacoes = (valorRestante, pacotesUsados, nivelRecursao = 0) => {
      if (nivelRecursao > 5) return;
      
      if (valorRestante <= 15 && pacotesUsados.length > 0) {
        const valorUsado = valorTotal - valorRestante;
        const descricao = this.gerarDescricaoDivisao(pacotesUsados);
        
        divisoes.push({
          pacotes: [...pacotesUsados],
          valorUsado: valorUsado,
          valorRestante: valorRestante,
          descricao: descricao,
          eficiencia: valorUsado / valorTotal
        });
        return;
      }
      
      for (const preco of precos) {
        if (preco.preco <= valorRestante && preco.tipo !== 'saldo') {
          const novosPacotes = [...pacotesUsados];
          
          const pacoteExistente = novosPacotes.find(p => p.preco === preco.preco);
          if (pacoteExistente) {
            pacoteExistente.quantidade++;
          } else {
            novosPacotes.push({
              descricao: preco.descricao,
              preco: preco.preco,
              quantidade: 1,
              tipo: preco.tipo
            });
          }
          
          encontrarCombinacoes(valorRestante - preco.preco, novosPacotes, nivelRecursao + 1);
        }
      }
    };
    
    encontrarCombinacoes(valorTotal, []);
    
    divisoes.sort((a, b) => {
      if (Math.abs(a.eficiencia - b.eficiencia) < 0.1) {
        return a.pacotes.length - b.pacotes.length;
      }
      return b.eficiencia - a.eficiencia;
    });
    
    console.log(`   📊 ${divisoes.length} divisões encontradas`);
    
    return divisoes.slice(0, 5);
  }

  // === GERAR DESCRIÇÃO DA DIVISÃO ===
  gerarDescricaoDivisao(pacotes) {
    const grupos = {};
    
    pacotes.forEach(pacote => {
      const chave = `${pacote.descricao}-${pacote.preco}`;
      if (grupos[chave]) {
        grupos[chave].quantidade += pacote.quantidade;
      } else {
        grupos[chave] = { ...pacote };
      }
    });
    
    const descricoes = Object.values(grupos).map(grupo => {
      if (grupo.quantidade > 1) {
        return `${grupo.quantidade}x ${grupo.descricao}`;
      } else {
        return `1x ${grupo.descricao}`;
      }
    });
    
    return descricoes.join(' + ');
  }

  // === ANALISAR PEDIDOS ESPECÍFICOS ===
  analisarPedidosEspecificos(mensagem, configGrupo) {
    console.log(`   🔍 Analisando pedidos específicos na mensagem...`);
    
    const precos = this.extrairPrecosTabela(configGrupo.tabela);
    if (precos.length === 0) {
      console.log(`   ❌ Sem tabela de preços para análise`);
      return null;
    }
    
    // Padrões melhorados para pedidos específicos (com suporte a números espaçados)
    const padroesPedidos = [
      // Formato: quantidade + unidade + número (com ou sem espaços no número, incluindo 258)
      /(\d+(?:\.\d+)?)\s*(gb|g|giga|gigas?|mb|m|mega|megas?)\s+(?:\+?\s*258\s*)?(?:8\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]|8[0-9]\s*[0-9]{3}\s*[0-9]{4}|8[0-9]{8})/gi,
      // Formato: número + quantidade + unidade (com ou sem espaços no número, incluindo 258)
      /(?:\+?\s*258\s*)?(?:8\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]|8[0-9]\s*[0-9]{3}\s*[0-9]{4}|8[0-9]{8})\s+(\d+(?:\.\d+)?)\s*(gb|g|giga|gigas?|mb|m|mega|megas?)/gi,
      // Formato com "para": 2gb para 852413946 ou 85 211 8624 ou 258 8 5 2...
      /(\d+(?:\.\d+)?)\s*(gb|g|giga|gigas?|mb|m|mega|megas?)\s+(?:para\s+)?(?:\+?\s*258\s*)?(?:8\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]\s*[0-9]|8[0-9]\s*[0-9]{3}\s*[0-9]{4}|8[0-9]{8})/gi
    ];
    
    const pedidos = [];
    
    for (const padrao of padroesPedidos) {
      let match;
      while ((match = padrao.exec(mensagem)) !== null) {
        let quantidade, unidade, numeroRaw;

        // Detectar formato: quantidade + unidade + número
        if (match[1] && /\d/.test(match[1]) && match[2] && match[3]) {
          quantidade = parseFloat(match[1]);
          unidade = match[2].toLowerCase();
          numeroRaw = match[3];
        }
        // Detectar formato: número + quantidade + unidade
        else if (match[1] && match[2] && /\d/.test(match[2]) && match[3]) {
          numeroRaw = match[1];
          quantidade = parseFloat(match[2]);
          unidade = match[3].toLowerCase();
        }

        // Normalizar o número (remover espaços, +258, etc)
        const numero = numeroRaw ? this.normalizarNumero(numeroRaw) : null;

        if (quantidade && unidade && numero) {
          let quantidadeGB;
          if (unidade.includes('gb') || unidade.includes('giga') || unidade === 'g') {
            quantidadeGB = quantidade;
          } else if (unidade.includes('mb') || unidade.includes('mega') || unidade === 'm') {
            quantidadeGB = quantidade / 1024;
          } else {
            continue;
          }
          
          const precoEncontrado = this.encontrarPrecoParaQuantidade(quantidadeGB, precos);
          
          if (precoEncontrado) {
            pedidos.push({
              numero: numero,
              quantidade: quantidadeGB,
              descricao: `${quantidadeGB}GB`,
              preco: precoEncontrado.preco,
              original: match[0]
            });
            
            console.log(`   ✅ Pedido específico: ${quantidadeGB}GB para ${numero} = ${precoEncontrado.preco}MT`);
          }
        }
      }
    }
    
    if (pedidos.length > 0) {
      const valorTotal = pedidos.reduce((sum, p) => sum + p.preco, 0);
      console.log(`   📊 Total de pedidos específicos: ${pedidos.length}`);
      console.log(`   💰 Valor total calculado: ${valorTotal}MT`);
      
      return {
        pedidos: pedidos,
        valorTotal: valorTotal,
        numeros: pedidos.map(p => p.numero)
      };
    }
    
    console.log(`   ❌ Nenhum pedido específico encontrado`);
    return null;
  }

  // === ENCONTRAR PREÇO PARA QUANTIDADE ===
  encontrarPrecoParaQuantidade(quantidadeGB, precos) {
    const quantidadeMB = quantidadeGB * 1024;
    
    // Procurar preço exato primeiro
    const precoExato = precos.find(p => {
      if (p.descricao.includes('GB')) {
        const gbNaTabela = parseFloat(p.descricao.replace('GB', ''));
        return Math.abs(gbNaTabela - quantidadeGB) < 0.1;
      } else if (p.descricao.includes('MB')) {
        const mbNaTabela = parseFloat(p.descricao.replace('MB', ''));
        return Math.abs(mbNaTabela - quantidadeMB) < 10;
      }
      return false;
    });
    
    if (precoExato) {
      console.log(`      ✅ Preço exato encontrado: ${quantidadeGB}GB = ${precoExato.preco}MT`);
      return precoExato;
    }
    
    // Se não encontrou exato, procurar o mais próximo
    const precoProximo = precos
      .filter(p => p.tipo !== 'saldo')
      .sort((a, b) => {
        const diffA = Math.abs(a.quantidade - quantidadeMB);
        const diffB = Math.abs(b.quantidade - quantidadeMB);
        return diffA - diffB;
      })[0];
    
    if (precoProximo) {
      console.log(`      ⚡ Preço aproximado: ${quantidadeGB}GB ≈ ${precoProximo.descricao} = ${precoProximo.preco}MT`);
      return precoProximo;
    }
    
    return null;
  }

  // === BUSCAR COMPROVANTE RECENTE NO HISTÓRICO (MELHORADO) ===
  async buscarComprovanteRecenteNoHistorico(remetente, timestamp) {
    console.log(`   🔍 Buscando comprovante recente no histórico...`);

    // AUMENTADO: 30 minutos para dar mais tempo
    const mensagensRecentes = this.historicoMensagens.filter(msg => {
      const timeDiff = timestamp - msg.timestamp;
      return msg.remetente === remetente && timeDiff <= 1800000; // 30 minutos
    });

    if (mensagensRecentes.length === 0) {
      console.log(`   ❌ Nenhuma mensagem recente nos últimos 30 min`);
      return null;
    }

    console.log(`   📊 Analisando ${mensagensRecentes.length} mensagens dos últimos 30 minutos...`);

    // Procurar comprovante nas mensagens recentes (mais recentes primeiro)
    for (let msg of mensagensRecentes.reverse()) {
      if (msg.tipo === 'texto') {
        console.log(`   🔍 Verificando mensagem: "${msg.mensagem.substring(0, 50)}..."`);
        
        const comprovante = await this.analisarComprovante(msg.mensagem);
        if (comprovante) {
          const tempoDecorrido = Math.floor((timestamp - msg.timestamp) / 60000);
          console.log(`   ✅ Comprovante encontrado no histórico: ${comprovante.referencia} - ${comprovante.valor}MT (${tempoDecorrido} min atrás)`);
          return comprovante;
        }
      }
    }

    console.log(`   ❌ Comprovante não encontrado no histórico`);
    return null;
  }

  // === FUNÇÃO PRINCIPAL PARA O BOT (MELHORADA) ===
  async processarMensagemBot(mensagem, remetente, tipoMensagem = 'texto', configGrupo = null, legendaImagem = null) {
    const timestamp = Date.now();

    // PROCESSAMENTO DE IMAGENS DESATIVADO
    if (tipoMensagem === 'imagem') {
      console.log(`\n🚫 IMAGEM REJEITADA - Processamento desativado`);
      return {
        sucesso: false,
        erro: true,
        tipo: 'imagem_desativada',
        mensagem: 'Processamento de imagens desativado para otimização'
      };
    }

    console.log(`\n🧠 IA processando TEXTO`);

    // Adicionar ao histórico
    this.adicionarAoHistorico(mensagem, remetente, timestamp, tipoMensagem);

    try {
      return await this.processarTexto(mensagem, remetente, timestamp, configGrupo);
    } catch (error) {
      console.error('❌ Erro na IA:', error);
      return { erro: true, mensagem: error.message };
    }
  }

  // === PROCESSAR TEXTO (MELHORADO) ===
  async processarTexto(mensagem, remetente, timestamp, configGrupo = null) {
    console.log(`   📝 Analisando mensagem: "${mensagem}"`);

    // IGNORAR COMANDOS ADMIN/BOT (não processar como comprovante)
    if (mensagem.startsWith('.')) {
      console.log(`   🤖 Comando detectado - ignorando processamento de comprovante`);
      return {
        sucesso: false,
        tipo: 'comando_ignorado',
        mensagem: null
      };
    }

    // VERIFICAR PEDIDOS ESPECÍFICOS PRIMEIRO
    if (configGrupo) {
      const pedidosEspecificos = this.analisarPedidosEspecificos(mensagem, configGrupo);
      if (pedidosEspecificos) {
        console.log(`   🎯 PEDIDOS ESPECÍFICOS DETECTADOS!`);
        
        // Verificar se há comprovante na mensagem ou no histórico
        const { textoComprovante } = this.separarComprovanteENumeros(mensagem);
        let comprovante = null;
        
        if (textoComprovante && textoComprovante.length > 10) {
          comprovante = await this.analisarComprovante(textoComprovante);
        }
        
        // Se não encontrou comprovante na mensagem, buscar no histórico
        if (!comprovante) {
          comprovante = await this.buscarComprovanteRecenteNoHistorico(remetente, timestamp);
        }
        
        if (comprovante) {
          const valorPago = parseFloat(comprovante.valor);
          const valorCalculado = pedidosEspecificos.valorTotal;
          
          console.log(`   💰 Valor pago: ${valorPago}MT`);
          console.log(`   🧮 Valor calculado: ${valorCalculado}MT`);
          
          // Verificar se valores batem (tolerância de ±5MT)
          if (Math.abs(valorPago - valorCalculado) <= 5) {
            console.log(`   ✅ VALORES COMPATÍVEIS! Processando pedidos específicos...`);
            
            const resultados = pedidosEspecificos.pedidos.map(pedido => 
              `${comprovante.referencia}|${pedido.preco}|${pedido.numero}`
            );
            
            console.log(`   ✅ PEDIDOS ESPECÍFICOS PROCESSADOS: ${resultados.join(' + ')}`);
            
            return { 
              sucesso: true, 
              dadosCompletos: resultados.join('\n'),
              tipo: 'pedidos_especificos_processados',
              numeros: pedidosEspecificos.numeros,
              pedidos: pedidosEspecificos.pedidos,
              valorTotal: valorCalculado,
              valorPago: valorPago
            };
          } else {
            console.log(`   ❌ VALORES INCOMPATÍVEIS! Diferença: ${Math.abs(valorPago - valorCalculado)}MT`);
            
            return {
              sucesso: false,
              tipo: 'valores_incompativeis',
              valorPago: valorPago,
              valorCalculado: valorCalculado,
              pedidos: pedidosEspecificos.pedidos,
              mensagem: `Valor pago (${valorPago}MT) não corresponde aos pedidos (${valorCalculado}MT). Verifique os valores.`
            };
          }
        }
      }
    }
    
    // MELHORAR DETECÇÃO: Verificar se é uma mensagem que contém apenas números
    const mensagemLimpa = mensagem.trim();
    const apenasNumeroRegex = /^8[0-9]{8}$/; // Exatamente um número de 9 dígitos
    const multiplosNumerosRegex = /^(8[0-9]{8}[\s,]*)+$/; // Múltiplos números separados por espaço ou vírgula
    
    console.log(`   🔍 Verificando se é apenas número(s)...`);
    // console.log(`   📝 Mensagem limpa: "${mensagemLimpa}"`);
    
    if (apenasNumeroRegex.test(mensagemLimpa) || multiplosNumerosRegex.test(mensagemLimpa)) {
      console.log(`   📱 DETECTADO: Mensagem contém apenas número(s)!`);
      
      // Extrair números da mensagem
      const numerosDetectados = mensagemLimpa.match(/8[0-9]{8}/g) || [];
      console.log(`   📱 Números detectados: ${numerosDetectados.length}`);
      
      if (numerosDetectados.length > 0) {
        return await this.processarNumeros(numerosDetectados, remetente, timestamp, mensagem, configGrupo);
      }
    }
    
    // LÓGICA ORIGINAL: Separar comprovante e números
    const { textoComprovante, numeros } = this.separarComprovanteENumeros(mensagem);
    
    // 1. Verificar se é um comprovante
    let comprovante = null;
    if (textoComprovante && textoComprovante.length > 10) {
      comprovante = await this.analisarComprovante(textoComprovante);
    }
    
    // 2. Se encontrou comprovante E números na mesma mensagem
    if (comprovante && numeros.length > 0) {
      console.log(`   🎯 COMPROVANTE + NÚMEROS na mesma mensagem!`);
      console.log(`   💰 Comprovante: ${comprovante.referencia} - ${comprovante.valor}MT`);
      console.log(`   📱 Números: ${numeros.length}`);
      
      // Processar imediatamente como pedido completo
      if (configGrupo && parseFloat(comprovante.valor) >= 32) {
        const analiseAutomatica = await this.analisarDivisaoAutomatica(comprovante.valor, configGrupo);
        if (analiseAutomatica.deveDividir) {
          const comprovanteComDivisao = {
            referencia: comprovante.referencia,
            valor: comprovante.valor,
            timestamp: timestamp,
            fonte: comprovante.fonte,
            tipo: 'divisao_automatica',
            analiseAutomatica: analiseAutomatica
          };
          
          return await this.processarNumerosComDivisaoAutomatica(numeros, remetente, comprovanteComDivisao);
        }
      }
      
      // Processamento normal (sem divisão automática)
      if (numeros.length === 1) {
        // Calcular megas baseado no valor e tabela do grupo
        const megas = configGrupo ? this.calcularMegasPorValor(comprovante.valor, configGrupo.tabela) : comprovante.valor;
        // DEBUG removido para performance
        const resultado = `${comprovante.referencia}|${megas}|${numeros[0]}`;
        console.log(`   ✅ PEDIDO COMPLETO IMEDIATO: ${resultado} (${comprovante.valor}MT → ${megas}MB)`);
        return { 
          sucesso: true, 
          dadosCompletos: resultado,
          tipo: 'numero_processado',
          numero: numeros[0],
          valorComprovante: comprovante.valor,
          valorPago: comprovante.valor,
          megas: megas
        };
      } else {
        // Múltiplos números - dividir valor igualmente
        const valorTotal = parseFloat(comprovante.valor);
        const valorPorNumero = (valorTotal / numeros.length).toFixed(2);
        
        const resultados = numeros.map(numero => 
          `${comprovante.referencia}|${valorPorNumero}|${numero}`
        );
        
        console.log(`   ✅ PEDIDOS MÚLTIPLOS IMEDIATOS: ${resultados.join(' + ')}`);
        return { 
          sucesso: true, 
          dadosCompletos: resultados.join('\n'),
          tipo: 'numeros_multiplos_processados',
          numeros: numeros,
          valorCada: valorPorNumero
        };
      }
    }
    
    // 3. Se encontrou apenas números (sem comprovante)
    if (numeros.length > 0 && !comprovante) {
      console.log(`   📱 Números detectados: ${numeros.length}`);
      return await this.processarNumeros(numeros, remetente, timestamp, mensagem, configGrupo);
    }
    
    // 4. Se encontrou apenas comprovante (sem números)
    if (comprovante && numeros.length === 0) {
      console.log(`   💰 Apenas comprovante detectado: ${comprovante.referencia} - ${comprovante.valor}MT`);
      
      // Analisar divisão automática
      if (configGrupo && parseFloat(comprovante.valor) >= 32) {
        const analiseAutomatica = await this.analisarDivisaoAutomatica(comprovante.valor, configGrupo);
        if (analiseAutomatica.deveDividir) {
          await this.processarComprovanteComDivisao(comprovante, remetente, timestamp, analiseAutomatica);
          return { 
            sucesso: true, 
            tipo: 'comprovante_com_divisao_automatica',
            referencia: comprovante.referencia,
            valor: comprovante.valor,
            pacotesSugeridos: analiseAutomatica.pacotes,
            divisaoCompleta: analiseAutomatica.divisaoCompleta,
            mensagem: analiseAutomatica.mensagemCliente
          };
        }
      }
      
      await this.processarComprovante(comprovante, remetente, timestamp);
      
      // Calcular megas para mostrar na mensagem
      const megas = configGrupo ? this.calcularMegasPorValor(comprovante.valor, configGrupo.tabela) : comprovante.valor;
      
      return { 
        sucesso: true, 
        tipo: 'comprovante_recebido',
        referencia: comprovante.referencia,
        valor: comprovante.valor,
        megas: megas,
        mensagem: 'Comprovante recebido! Agora envie o número que vai receber os megas.'
      };
    }
    
    // 5. Não reconheceu
    console.log(`   ❓ Mensagem não reconhecida como comprovante ou número`);
    return { 
      sucesso: false, 
      tipo: 'mensagem_nao_reconhecida',
      mensagem: null 
    };
  }

  // === FUNÇÕES DE PROCESSAMENTO DE IMAGEM REMOVIDAS ===
  // processarImagem, processarImagemGPTVision, etc. - REMOVIDAS
  /*
  async processarImagem_REMOVIDA(imagemBase64, remetente, timestamp, configGrupo = null, legendaImagem = null) {
    console.log(`📸 Processando imagem`);
    
    // Validação melhorada da legenda
    const temLegendaValida = legendaImagem && 
                            typeof legendaImagem === 'string' && 
                            legendaImagem.trim().length > 0;
    
    if (temLegendaValida) {
      // console.log(`📝 Legenda detectada: "${legendaImagem.trim()}"`);
    } else {
      // console.log(`📝 Sem legenda válida`);
    }

    // PRIORIDADE 1: Tentar método híbrido (Google Vision + GPT-4)
    if (this.googleVisionEnabled) {
      try {
        console.log('🚀 Tentando método híbrido (Google Vision + GPT-4)...');
        return await this.processarImagemHibrida(imagemBase64, remetente, timestamp, configGrupo, legendaImagem);
      } catch (error) {
        console.log(`⚠️ Método híbrido falhou: ${error.message}`);
        console.log('🔄 Tentando fallback com GPT-4 Vision...');
      }
    } else {
      console.log('⚠️ Google Vision desabilitado, usando GPT-4 Vision diretamente');
    }

    // FALLBACK: GPT-4 Vision (método original preservado 100%)
    return await this.processarImagemGPTVision(imagemBase64, remetente, timestamp, configGrupo, legendaImagem);
  }

  // === PROCESSAR IMAGEM COM GPT-4 VISION (MÉTODO ORIGINAL PRESERVADO) ===
  async processarImagemGPTVision(imagemBase64, remetente, timestamp, configGrupo = null, legendaImagem = null) {
    console.log(`🧠 Usando GPT-4 Vision como ${this.googleVisionEnabled ? 'fallback' : 'método principal'}`);
    
    const prompt = `
Analisa esta imagem de comprovante de pagamento M-Pesa ou E-Mola de Moçambique.

Procura por:
1. Referência da transação (exemplos: CGC4GQ17W84, PP250712.2035.u31398, etc.)
2. Valor transferido (em MT - Meticais)

ATENÇÃO: 
- Procura por palavras como "Confirmado", "ID da transacao", "Transferiste"
- O valor pode estar em formato "100.00MT", "100MT", "100,00MT"
- A referência é geralmente um código alfanumérico

Responde APENAS no formato JSON:
{
  "referencia": "CGC4GQ17W84",
  "valor": "210",
  "encontrado": true
}

Se não conseguires ler a imagem ou extrair os dados:
{"encontrado": false}
`;

    try {
      // Aplicar rate limiting
      await this.checkRateLimit();

      const resposta = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imagemBase64}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 300
      });

      console.log(`🔍 Resposta GPT-4 Vision: ${resposta.choices[0].message.content}`);
      
      const resultado = this.extrairJSON(resposta.choices[0].message.content);
      console.log(`✅ JSON extraído (GPT-4 Vision):`, resultado);
      
      if (resultado.encontrado) {
        const comprovante = {
          referencia: resultado.referencia,
          valor: this.limparValor(resultado.valor),
          fonte: 'gpt4_vision',
          metodo: 'gpt4_vision'
        };
        
        console.log(`✅ Dados extraídos (GPT-4 Vision): ${comprovante.referencia} - ${comprovante.valor}MT`);
        
        return await this.processarComprovanteExtraido(comprovante, remetente, timestamp, configGrupo, legendaImagem);
      } else {
        console.log(`❌ GPT-4 Vision não conseguiu extrair dados da imagem`);
        return {
          sucesso: false,
          tipo: 'imagem_nao_reconhecida',
          mensagem: 'Não consegui ler o comprovante na imagem. Envie como texto.'
        };
      }
      
    } catch (error) {
      console.error('❌ Erro no GPT-4 Vision:', error);
      return {
        sucesso: false,
        tipo: 'erro_processamento_imagem',
        mensagem: 'Erro ao processar imagem. Tente enviar como texto.'
      };
    }
  */

  // === PROCESSAR COMPROVANTE COM DIVISÃO ===
  async processarComprovanteComDivisao(comprovante, remetente, timestamp, analiseAutomatica) {
    console.log(`   🧮 Processando comprovante com divisão automática...`);
    
    this.comprovantesEmAberto[remetente] = {
      referencia: comprovante.referencia,
      valor: comprovante.valor,
      timestamp: timestamp,
      fonte: comprovante.fonte,
      tipo: 'divisao_automatica',
      analiseAutomatica: analiseAutomatica
    };

    console.log(`   ⏳ Comprovante com divisão automática guardado, aguardando números...`);
  }

  // === PROCESSAR NÚMEROS (MELHORADO) ===
  async processarNumeros(numeros, remetente, timestamp, mensagemOriginal, configGrupo = null) {
    console.log(`   🔢 Processando ${numeros.length} número(s)`);
    console.log(`   📝 Mensagem original: "${mensagemOriginal}"`);
    
    // Verificar se tem comprovante em aberto PRIMEIRO
    if (this.comprovantesEmAberto[remetente]) {
      const comprovante = this.comprovantesEmAberto[remetente];
      console.log(`   ✅ Comprovante em aberto encontrado: ${comprovante.referencia} - ${comprovante.valor}MT`);
      
      // CASO ESPECIAL: Comprovante com divisão automática
      if (comprovante.tipo === 'divisao_automatica') {
        return await this.processarNumerosComDivisaoAutomatica(numeros, remetente, comprovante);
      }
      
      // Calcular megas totais baseado no valor e tabela do grupo
      const megasTotais = configGrupo ? this.calcularMegasPorValor(comprovante.valor, configGrupo.tabela) : comprovante.valor;
      const LIMITE_BLOCO = 10240; // 10GB

      console.log(`   📊 Megas totais: ${megasTotais}MB para ${numeros.length} número(s)`);

      // === VERIFICAR SE PRECISA DIVIDIR EM BLOCOS DE 10GB ===
      if (megasTotais > LIMITE_BLOCO || (numeros.length > 1 && (megasTotais / numeros.length) > LIMITE_BLOCO)) {
        console.log(`   🔧 Transferência > 10GB - DIVIDINDO EM BLOCOS`);

        const tabelaPrecos = configGrupo ? configGrupo.tabela : null;
        const divisao = this.dividirEmBlocos(comprovante.referencia, megasTotais, numeros, tabelaPrecos);

        if (!divisao.sucesso) {
          console.error(`   ❌ Erro na divisão em blocos:`, divisao.erro);
          return {
            sucesso: false,
            tipo: 'erro_divisao',
            erro: divisao.erro
          };
        }

        // Criar dadosCompletos a partir dos blocos
        const dadosCompletos = divisao.pedidos.map(p =>
          `${p.referencia}|${p.megas}|${p.numero}`
        ).join('\n');

        delete this.comprovantesEmAberto[remetente];

        console.log(`   ✅ DIVISÃO CONCLUÍDA: ${divisao.totalBlocos} blocos criados`);

        return {
          sucesso: true,
          dadosCompletos: dadosCompletos,
          tipo: 'divisao_blocos',
          numeros: numeros,
          totalBlocos: divisao.totalBlocos,
          megasPorNumero: divisao.megasPorNumero,
          valorTotal: divisao.valorTotal,
          divisao: divisao,
          origem: 'comprovante_em_aberto_com_divisao'
        };
      }

      // === PROCESSAMENTO NORMAL (SEM DIVISÃO) ===
      if (numeros.length === 1) {
        const resultado = `${comprovante.referencia}|${megasTotais}|${numeros[0]}`;
        delete this.comprovantesEmAberto[remetente];

        console.log(`   ✅ PEDIDO COMPLETO: ${resultado} (${comprovante.valor}MT → ${megasTotais}MB)`);
        return {
          sucesso: true,
          dadosCompletos: resultado,
          tipo: 'numero_processado',
          numero: numeros[0],
          valorComprovante: comprovante.valor,
          origem: 'comprovante_em_aberto',
          valorPago: comprovante.valor,
          megas: megasTotais
        };

      } else {
        const valorTotal = parseFloat(comprovante.valor);
        const valorPorNumero = (valorTotal / numeros.length).toFixed(2);

        console.log(`   🔄 Dividindo ${valorTotal}MT por ${numeros.length} números = ${valorPorNumero}MT cada`);

        const resultados = numeros.map(numero =>
          `${comprovante.referencia}|${valorPorNumero}|${numero}`
        );

        delete this.comprovantesEmAberto[remetente];

        console.log(`   ✅ PEDIDOS MÚLTIPLOS: ${resultados.join(' + ')}`);
        return {
          sucesso: true,
          dadosCompletos: resultados.join('\n'),
          tipo: 'numeros_multiplos_processados',
          numeros: numeros,
          valorCada: valorPorNumero,
          origem: 'comprovante_em_aberto'
        };
      }
    }

    // SE NÃO TEM COMPROVANTE EM ABERTO, buscar no histórico
    console.log(`   ❌ Nenhum comprovante em aberto. Buscando no histórico...`);
    const resultadoHistorico = await this.buscarComprovanteNoHistoricoMultiplo(numeros, remetente, timestamp, configGrupo);
    if (resultadoHistorico) {
      console.log(`   ✅ Comprovante encontrado no histórico!`);
      return resultadoHistorico;
    }

    // Sem comprovante
    console.log(`   ❌ Nenhum comprovante encontrado`);
    return { 
      sucesso: false, 
      tipo: 'numeros_sem_comprovante',
      numeros: numeros,
      mensagem: `${numeros.length} número(s) detectado(s), mas não encontrei comprovante nos últimos 30 minutos. Envie o comprovante primeiro.`
    };
  }

  // === PROCESSAR NÚMEROS COM DIVISÃO AUTOMÁTICA ===
  async processarNumerosComDivisaoAutomatica(numeros, remetente, comprovante) {
    console.log(`   🧮 Processando números com divisão automática...`);
    
    const analise = comprovante.analiseAutomatica;
    const totalPacotes = analise.pacotes.reduce((sum, p) => sum + p.quantidade, 0);
    
    console.log(`   📊 Total de pacotes na divisão: ${totalPacotes}`);
    console.log(`   📱 Números fornecidos: ${numeros.length}`);
    
    if (numeros.length === 1) {
      console.log(`   🎯 Enviando todos os pacotes para um número: ${numeros[0]}`);
      
      const resultados = [];
      
      for (const pacote of analise.pacotes) {
        for (let i = 0; i < pacote.quantidade; i++) {
          resultados.push(`${comprovante.referencia}|${pacote.preco}|${numeros[0]}`);
        }
      }
      
      if (this.comprovantesEmAberto[remetente]) {
        delete this.comprovantesEmAberto[remetente];
      }
      
      console.log(`   ✅ DIVISÃO AUTOMÁTICA COMPLETA: ${resultados.length} pacotes para ${numeros[0]}`);
      
      return { 
        sucesso: true, 
        dadosCompletos: resultados.join('\n'),
        tipo: 'divisao_automatica_processada',
        numero: numeros[0],
        totalPacotes: resultados.length,
        divisaoCompleta: analise.divisaoCompleta,
        detalhePacotes: analise.pacotes
      };
      
    } else if (numeros.length === totalPacotes) {
      console.log(`   🎯 Distribuindo um pacote para cada número`);
      
      const resultados = [];
      let indicePacote = 0;
      
      for (const pacote of analise.pacotes) {
        for (let i = 0; i < pacote.quantidade; i++) {
          if (indicePacote < numeros.length) {
            resultados.push(`${comprovante.referencia}|${pacote.preco}|${numeros[indicePacote]}`);
            indicePacote++;
          }
        }
      }
      
      if (this.comprovantesEmAberto[remetente]) {
        delete this.comprovantesEmAberto[remetente];
      }
      
      console.log(`   ✅ DISTRIBUIÇÃO 1:1 COMPLETA: ${resultados.length} pacotes distribuídos`);
      
      return { 
        sucesso: true, 
        dadosCompletos: resultados.join('\n'),
        tipo: 'divisao_automatica_distribuida',
        numeros: numeros,
        totalPacotes: resultados.length,
        divisaoCompleta: analise.divisaoCompleta,
        distribuicao: '1 pacote por número'
      };
      
    } else {
      console.log(`   🔄 Números diferentes dos pacotes, dividindo valor igualmente`);
      
      const valorTotal = parseFloat(comprovante.valor);
      const valorPorNumero = (valorTotal / numeros.length).toFixed(2);
      
      const resultados = numeros.map(numero => 
        `${comprovante.referencia}|${valorPorNumero}|${numero}`
      );
      
      if (this.comprovantesEmAberto[remetente]) {
        delete this.comprovantesEmAberto[remetente];
      }
      
      console.log(`   ✅ DIVISÃO IGUALITÁRIA: ${valorPorNumero}MT para cada número`);
      
      return { 
        sucesso: true, 
        dadosCompletos: resultados.join('\n'),
        tipo: 'divisao_automatica_igualitaria',
        numeros: numeros,
        valorCada: valorPorNumero,
        observacao: `Valor dividido igualmente entre ${numeros.length} números`
      };
    }
  }

  // === FUNÇÃO AUXILIAR PARA EXTRAIR JSON ===
  extrairJSON(texto) {
    try {
      return JSON.parse(texto);
    } catch (e) {
      try {
        let limpo = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        return JSON.parse(limpo);
      } catch (e2) {
        try {
          const match = texto.match(/\{[\s\S]*\}/);
          if (match) {
            return JSON.parse(match[0]);
          }
        } catch (e3) {
          throw new Error(`Não foi possível extrair JSON: ${texto}`);
        }
      }
    }
  }

  // === ANALISAR COMPROVANTE ===
  async analisarComprovante(mensagem) {
    const mensagemLimpa = mensagem.trim();
    
    // DISTINGUIR: Mensagens do bot secundário NÃO são comprovativos de pagamento
    // Elas são confirmações de processamento, mas não comprovativos para novos pedidos
    if (/✅.*Transação Concluída Com Sucesso/i.test(mensagemLimpa) || 
        /Transferencia Processada Automaticamente Pelo Sistema/i.test(mensagemLimpa) ||
        (/📱.*Número:.*\d{9}/i.test(mensagemLimpa) && /📊.*Megas:/i.test(mensagemLimpa) && /🔖.*Referência:/i.test(mensagemLimpa))) {
      console.log('🤖 Detectada confirmação do bot secundário (não é comprovativo de pagamento)');
      return null; // Não é um comprovativo de pagamento real
    }
    
    const temConfirmado = /^confirmado/i.test(mensagemLimpa);
    const temID = /^id\s/i.test(mensagemLimpa);
    
    if (!temConfirmado && !temID) {
      return null;
    }

    const prompt = `
Analisa esta mensagem de comprovante de pagamento M-Pesa ou E-Mola de Moçambique:

"${mensagem}"

Extrai a referência da transação e o valor transferido.
Procura especialmente por padrões como:
- "Confirmado [REFERENCIA]" 
- "Transferiste [VALOR]MT"

Responde APENAS no formato JSON:
{
  "referencia": "CGC4GQ17W84",
  "valor": "210",
  "encontrado": true
}

Se não conseguires extrair, responde:
{"encontrado": false}
`;

    const resposta = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Você é especialista em analisar comprovantes de pagamento moçambicanos M-Pesa e E-Mola." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 200
    });

    try {
      const resultado = this.extrairJSON(resposta.choices[0].message.content);
      
      if (resultado.encontrado) {
        return {
          referencia: resultado.referencia,
          valor: this.limparValor(resultado.valor),
          fonte: 'texto'
        };
      }
    } catch (parseError) {
      console.error('❌ Erro ao parsear resposta da IA:', parseError);
    }

    return null;
  }

  // === PROCESSAR COMPROVANTE ===
  async processarComprovante(comprovante, remetente, timestamp) {
    this.comprovantesEmAberto[remetente] = {
      referencia: comprovante.referencia,
      valor: comprovante.valor,
      timestamp: timestamp,
      fonte: comprovante.fonte
    };

    console.log(`   ⏳ Comprovante guardado, aguardando número...`);
  }

  // === BUSCAR NO HISTÓRICO (MÚLTIPLOS) - MELHORADO ===
  async buscarComprovanteNoHistoricoMultiplo(numeros, remetente, timestamp, configGrupo = null) {
    console.log(`   🔍 Buscando comprovante no histórico para múltiplos números...`);

    // AUMENTADO: 30 minutos para dar mais tempo
    const mensagensRecentes = this.historicoMensagens.filter(msg => {
      const timeDiff = timestamp - msg.timestamp;
      return msg.remetente === remetente && timeDiff <= 1800000; // 30 minutos
    });

    if (mensagensRecentes.length === 0) {
      console.log(`   ❌ Nenhuma mensagem recente nos últimos 30 min`);
      return null;
    }

    console.log(`   📊 Analisando ${mensagensRecentes.length} mensagens dos últimos 30 minutos...`);

    for (let msg of mensagensRecentes.reverse()) {
      if (msg.tipo === 'texto') {
        console.log(`   🔍 Verificando mensagem: "${msg.mensagem.substring(0, 50)}..."`);
        
        const comprovante = await this.analisarComprovante(msg.mensagem);
        if (comprovante) {
          const valorTotal = parseFloat(comprovante.valor);
          const tempoDecorrido = Math.floor((timestamp - msg.timestamp) / 60000);
          
          console.log(`   ✅ Comprovante encontrado: ${comprovante.referencia} - ${comprovante.valor}MT (${tempoDecorrido} min atrás)`);
          
          if (numeros.length === 1) {
            // Calcular megas baseado no valor e tabela do grupo
            const megas = configGrupo ? this.calcularMegasPorValor(comprovante.valor, configGrupo.tabela) : comprovante.valor;
            const resultado = `${comprovante.referencia}|${megas}|${numeros[0]}`;
            console.log(`   ✅ ENCONTRADO NO HISTÓRICO: ${resultado} (${comprovante.valor}MT → ${megas}MB)`);
            return { 
              sucesso: true, 
              dadosCompletos: resultado,
              tipo: 'numero_processado',
              numero: numeros[0],
              tempoDecorrido: tempoDecorrido,
              valorPago: comprovante.valor,
              megas: megas
            };
          } else {
            const valorPorNumero = (valorTotal / numeros.length).toFixed(2);
            const resultados = numeros.map(numero => 
              `${comprovante.referencia}|${valorPorNumero}|${numero}`
            );
            
            console.log(`   ✅ ENCONTRADO NO HISTÓRICO (MÚLTIPLO): ${resultados.join(' + ')}`);
            return { 
              sucesso: true, 
              dadosCompletos: resultados.join('\n'),
              tipo: 'numeros_multiplos_processados',
              numeros: numeros,
              valorCada: valorPorNumero,
              tempoDecorrido: tempoDecorrido
            };
          }
        }
      }
    }

    console.log(`   ❌ Comprovante não encontrado no histórico`);
    return null;
  }

  // === LIMPAR VALOR MONETÁRIO ===
  limparValor(valor) {
    if (!valor) return '0';

    let valorStr = valor.toString();
    console.log(`🔧 DEBUG limparValor: entrada = "${valorStr}"`);

    // Remover unidades monetárias
    valorStr = valorStr.replace(new RegExp('\\s*(MT|mt|meticais?|metical)\\s*', 'gi'), '');
    valorStr = valorStr.trim();
    console.log(`🔧 DEBUG limparValor: após remover MT = "${valorStr}"`);

    // Tratamento inteligente de vírgulas e pontos
    if (valorStr.includes(',') && valorStr.includes('.')) {
      // Se tem ambos, vírgula é separador de milhares
      valorStr = valorStr.replace(/,/g, '');
    } else if (valorStr.includes(',')) {
      const parts = valorStr.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Vírgula é separador decimal
        valorStr = valorStr.replace(',', '.');
      } else {
        // Vírgula é separador de milhares
        valorStr = valorStr.replace(/,/g, '');
      }
    }

    console.log(`🔧 DEBUG limparValor: após tratamento vírgulas = "${valorStr}"`);

    // Extrair número
    const match = valorStr.match(/\d+(\.\d+)?/);
    if (match) {
      const numeroFinal = parseFloat(match[0]).toString();
      console.log(`✅ DEBUG limparValor: resultado = "${numeroFinal}"`);
      return numeroFinal;
    }

    // Fallback: apenas dígitos
    const digitos = valorStr.replace(/[^\d]/g, '');
    const resultado = digitos || '0';
    console.log(`❌ DEBUG limparValor: fallback = "${resultado}"`);
    return resultado;
  }

  // === EXTRAIR NÚMERO (MANTIDO PARA COMPATIBILIDADE) ===
  extrairNumero(mensagem) {
    const numeros = this.extrairTodosNumeros(mensagem);
    return numeros.length > 0 ? numeros[numeros.length - 1] : null;
  }

  // === HISTÓRICO ===
  adicionarAoHistorico(mensagem, remetente, timestamp, tipo = 'texto') {
    this.historicoMensagens.push({
      mensagem,
      remetente,
      timestamp,
      tipo
    });

    if (this.historicoMensagens.length > this.maxHistorico) {
      this.historicoMensagens = this.historicoMensagens.slice(-this.maxHistorico);
    }
  }
  // FIM DAS FUNÇÕES DE IMAGEM REMOVIDAS

  // === LIMPEZA (MELHORADA) ===
  limparComprovantesAntigos() {
    const agora = Date.now();
    const timeout = 45 * 60 * 1000; // AUMENTADO: 45 minutos
    let removidos = 0;

    Object.keys(this.comprovantesEmAberto).forEach(remetente => {
      const comprovante = this.comprovantesEmAberto[remetente];
      if (agora - comprovante.timestamp > timeout) {
        delete this.comprovantesEmAberto[remetente];
        removidos++;
      }
    });

    if (removidos > 0) {
      console.log(`🗑️ Removidos ${removidos} comprovantes antigos (>45min)`);
    }
  }

  // === STATUS ===
  getStatus() {
    return {
      comprovantesEmAberto: Object.keys(this.comprovantesEmAberto).length,
      mensagensNoHistorico: this.historicoMensagens.length,
      detalhesComprovantes: this.comprovantesEmAberto
    };
  }

  // === FUNÇÃO PARA COMANDOS ADMIN (OTIMIZADA) ===
  getStatusDetalhado() {
    let status = `🧠 *STATUS DA IA OTIMIZADA v5.0*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    status += `💾 Mensagens no histórico: ${this.historicoMensagens.length}\n`;
    status += `⏳ Comprovantes em aberto: ${Object.keys(this.comprovantesEmAberto).length}\n\n`;

    // Status otimizado
    status += `🔍 *SISTEMA DE PROCESSAMENTO:*\n`;
    status += `❌ Processamento de imagens: DESATIVADO\n`;
    status += `✅ Processamento de texto: ATIVO\n`;
    status += `⚡ Sistema otimizado para velocidade\n\n`;

    if (Object.keys(this.comprovantesEmAberto).length > 0) {
      status += `📋 *Comprovantes aguardando número:*\n`;
      Object.entries(this.comprovantesEmAberto).forEach(([remetente, comp]) => {
        const tempo = Math.floor((Date.now() - comp.timestamp) / 60000);
        const tipo = comp.tipo === 'divisao_automatica' ? ' 🧮' : '';
        status += `• ${remetente.replace('@c.us', '')}: ${comp.referencia} - ${comp.valor}MT${tipo} (${tempo}min)\n`;
      });
    }

    status += `\n🚀 *OTIMIZAÇÕES APLICADAS v5.0:*\n`;
    status += `✅ Processamento de imagens removido\n`;
    status += `✅ Google Vision removido\n`;
    status += `✅ Sistema mais rápido e estável\n`;
    status += `✅ Menor uso de recursos\n`;
    status += `✅ Verificação de pagamentos ativa\n`;
    status += `✅ Detecção de duplicatas ativa\n`;
    status += `✅ Contexto de legendas otimizado!\n`;
    status += `✅ Padrões de números expandidos!\n`;
    status += `✅ Divisão automática estável!\n`;
    status += `✅ Processamento multi-modal!\n`;
    status += `❌ Respostas interativas REMOVIDAS!\n`;
    
    return status;
  }
}

module.exports = WhatsAppAI;
