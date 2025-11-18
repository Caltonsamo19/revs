# 📦 Sistema de Pacotes Automáticos

## 📋 Índice
- [Visão Geral](#visão-geral)
- [Como Funciona](#como-funciona)
- [Tipos de Pacotes](#tipos-de-pacotes)
- [Modos de Ativação](#modos-de-ativação)
- [Comandos Disponíveis](#comandos-disponíveis)
- [Fluxo de Renovações](#fluxo-de-renovações)
- [Arquivos e Persistência](#arquivos-e-persistência)
- [Exemplos Práticos](#exemplos-práticos)

---

## 🎯 Visão Geral

O Sistema de Pacotes Automáticos gerencia **pacotes de internet com renovações diárias**. Quando um cliente compra um pacote de múltiplos dias, o sistema:

- ✅ Envia o pacote inicial automaticamente (modo automático)
- ✅ Agenda renovações diárias de 100MB
- ✅ Renova automaticamente 2h antes do horário original
- ✅ Mantém o pacote ativo pelo período contratado
- ✅ Remove automaticamente ao expirar

---

## 🔄 Como Funciona

### Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    SISTEMA DE PACOTES                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. DETECÇÃO DE PAGAMENTO                                    │
│     ├─ Cliente paga comprovante                              │
│     ├─ Sistema detecta pacote renovável na tabela            │
│     └─ Ativa automaticamente (MODO AUTOMÁTICO)               │
│                                                               │
│  2. ATIVAÇÃO MANUAL                                          │
│     ├─ Admin envia pacote manualmente                        │
│     ├─ Usa comando .pacote                                   │
│     └─ Apenas agenda renovações (MODO MANUAL)                │
│                                                               │
│  3. RENOVAÇÕES AUTOMÁTICAS                                   │
│     ├─ Verificação periódica (1 hora)                        │
│     ├─ Cria pedido + pagamento de 100MB                      │
│     ├─ Referência: {REF}D1, {REF}D2, {REF}D3...              │
│     └─ Horário: 2h antes do dia anterior                     │
│                                                               │
│  4. EXPIRAÇÃO                                                │
│     ├─ Remove cliente ao atingir data de expiração           │
│     └─ Salva no histórico                                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Tipos de Pacotes

| Dias | Renovações | Total de MB | Descrição |
|------|------------|-------------|-----------|
| **3** | 3x 100MB | Pacote inicial + 300MB | Pacote de 3 dias |
| **5** | 5x 100MB | Pacote inicial + 500MB | Pacote de 5 dias |
| **15** | 15x 100MB | Pacote inicial + 1.5GB | Pacote de 15 dias |
| **30** | 30x 100MB | Pacote inicial + 3GB | Pacote de 30 dias |

### Configuração

Os tipos de pacotes são configurados em `sistema_pacotes.js`:

```javascript
this.TIPOS_PACOTES = {
    '3': { dias: 3, nome: '3 Dias' },
    '5': { dias: 5, nome: '5 Dias' },
    '15': { dias: 15, nome: '15 Dias' },
    '30': { dias: 30, nome: '30 Dias' }
};
```

---

## ⚙️ Modos de Ativação

### 1️⃣ Modo Automático (Detecção de Pagamento)

**Quando acontece:**
- Cliente paga comprovante de pacote renovável
- Sistema detecta automaticamente pela tabela de preços

**O que o sistema faz:**
1. ✅ Cria **pedido** do pacote inicial (ex: 2000MB)
2. ✅ Cria **pagamento** do pacote inicial (ex: 44MT)
3. ✅ Registra cliente no sistema
4. ✅ Agenda renovações automáticas
5. ✅ Envia notificação ao grupo

**Exemplo:**
```
Cliente paga: 2000MB por 44MT (5 dias)

Sistema cria:
- Pedido: ABC123 → 2000MB
- Pagamento: ABC123 → 44MT
- Renovações agendadas: ABC123D1, D2, D3, D4, D5 (100MB cada)
```

### 2️⃣ Modo Manual (Comando .pacote)

**Quando usar:**
- Admin já enviou o pacote principal **manualmente**
- Quer apenas agendar as renovações automáticas

**O que o sistema faz:**
1. ❌ **NÃO cria** pedido/pagamento inicial
2. ✅ Registra cliente no sistema
3. ✅ Agenda renovações automáticas
4. ✅ Confirma agendamento

**Comando:**
```bash
.pacote DIAS REF NUMERO
```

**Exemplo:**
```bash
# Admin já enviou 1700MB manualmente
.pacote 5 ABC123 845123456

# Sistema apenas agenda:
# ABC123D1, D2, D3, D4, D5 (100MB cada)
```

---

## 🎮 Comandos Disponíveis

### 📌 Comandos Administrativos

#### `.pacote` - Agendar Renovações (Modo Manual)

```bash
.pacote DIAS REF NUMERO
```

**Parâmetros:**
- `DIAS` - Quantidade de dias (3, 5, 15, 30)
- `REF` - Referência única do pacote
- `NUMERO` - Número do cliente (ex: 845123456)

**Exemplos:**
```bash
.pacote 3 ABC123 845123456
.pacote 5 XYZ789 847654321
.pacote 15 DEF456 841234567
```

**Resposta:**
```
🎯 RENOVAÇÕES AGENDADAS!

📱 Número: 845123456
📋 Referência: ABC123
📅 Período: 5 dias
🔄 Renovações automáticas: 5x de 100MB (diárias, 2h antes)
📅 Expira em: 23/11/2025

⚠️ Lembrete: Você deve ter enviado o pacote principal manualmente!

💡 Verifique a validade com: .validade 845123456
```

---

#### `.pacotes_ativos` - Listar Pacotes Ativos (do grupo)

```bash
.pacotes_ativos
```

**Resposta:**
```
📦 PACOTES ATIVOS (3) - ESTE GRUPO
━━━━━━━━━━━━━━━━━━━━━━━

1. 845123456
   📋 Ref: ABC123
   📦 Tipo: 5 Dias
   📅 Restam: 3 dias
   🔄 Renovações: 2
   ⏰ Expira: 3d

2. 847654321
   📋 Ref: XYZ789
   📦 Tipo: 3 Dias
   📅 Restam: 1 dias
   🔄 Renovações: 2
   ⏰ Expira: 1d
```

---

#### `.pacotes_todos` - Listar Todos os Pacotes (admin global)

```bash
.pacotes_todos
```

Lista pacotes de **todos os grupos** (apenas para administradores globais).

---

#### `.pacotes_stats` - Estatísticas do Sistema

```bash
.pacotes_stats
```

**Resposta:**
```
📊 ESTATÍSTICAS PACOTES
━━━━━━━━━━━━━━━━━━━━━━━

📦 Total de clientes ativos: 15

📋 Por tipo de pacote:
   • 3 Dias: 5 clientes
   • 5 Dias: 8 clientes
   • 15 Dias: 2 clientes
   • 30 Dias: 0 clientes

🔄 Renovações últimas 24h: 23
⏰ Próximas renovações (6h): 4

📅 Próximas renovações:
   • 845123456: 18/11/2025 08:00 (3d restantes)
   • 847654321: 18/11/2025 10:30 (1d restantes)
```

---

### 👥 Comandos para Usuários

#### `.validade` - Verificar Validade do Pacote

```bash
.validade NUMERO
```

**Exemplo:**
```bash
.validade 845123456
```

**Resposta:**
```
📱 VALIDADE DO PACOTE
━━━━━━━━━━━━━━━━━━━━━━━

📱 Número: 845123456
📋 Referência: ABC123
📦 Tipo: 5 Dias

📅 Status do Pacote:
   • Dias restantes: 3 dias
   • Renovações feitas: 2/5
   • Expira em: 3 dia(s) (21/11/2025)

🔄 Próxima Renovação (100MB):
   📅 19/11/2025 às 08:00

💡 Cada renovação adiciona 100MB válidos por 24h.
    O sistema renova automaticamente 2h antes do horário anterior.
```

---

#### `.cancelar_pacote` - Cancelar Pacote

```bash
.cancelar_pacote NUMERO REFERENCIA
```

**Exemplo:**
```bash
.cancelar_pacote 845123456 ABC123
```

---

## 🔄 Fluxo de Renovações

### Cronograma de Renovações

**Exemplo: Pacote de 5 dias ativado em 18/11/2025 às 10:00**

| Dia | Data/Hora | Referência | Megas | Valor | Status |
|-----|-----------|------------|-------|-------|--------|
| **0** | 18/11 10:00 | ABC123 | 2000MB | 44MT | ✅ Pacote inicial |
| **1** | 19/11 08:00 | ABC123D1 | 100MB | 12.5MT | ⏰ Agendado |
| **2** | 20/11 08:00 | ABC123D2 | 100MB | 12.5MT | ⏰ Agendado |
| **3** | 21/11 08:00 | ABC123D3 | 100MB | 12.5MT | ⏰ Agendado |
| **4** | 22/11 08:00 | ABC123D4 | 100MB | 12.5MT | ⏰ Agendado |
| **5** | 23/11 08:00 | ABC123D5 | 100MB | 12.5MT | ⏰ Agendado |
| - | 24/11 10:00 | - | - | - | 🏁 Expira |

### Lógica de Agendamento

```javascript
// Próxima renovação = Mesmo horário amanhã - 2 horas
proximaRenovacao = dataAtual + 1 dia - 2 horas
```

**Exemplo:**
- Ativação: 18/11 às **10:00**
- 1ª renovação: 19/11 às **08:00** (10:00 - 2h)
- 2ª renovação: 20/11 às **08:00** (mantém o horário)
- 3ª renovação: 21/11 às **08:00** (mantém o horário)

---

## 💾 Arquivos e Persistência

### Arquivos de Dados

#### `dados_pacotes_clientes.json`
Armazena todos os clientes ativos com pacotes.

```json
{
  "845123456_ABC123": {
    "numero": "845123456",
    "referenciaOriginal": "ABC123",
    "grupoId": "120363355803754045@g.us",
    "tipoPacote": "5",
    "diasTotal": 5,
    "diasRestantes": 3,
    "megasIniciais": 2000,
    "valorMTInicial": 44,
    "dataInicio": "2025-11-18T10:00:00.000Z",
    "dataExpiracao": "2025-11-23T10:00:00.000Z",
    "horaEnvioOriginal": "2025-11-18T10:00:00.000Z",
    "proximaRenovacao": "2025-11-19T08:00:00.000Z",
    "renovacoes": 2,
    "status": "ativo",
    "ultimaRenovacao": "2025-11-18T10:00:00.000Z"
  }
}
```

#### `historico_renovacoes.json`
Armazena histórico das últimas 1000 renovações.

```json
[
  {
    "clienteId": "845123456_ABC123",
    "numero": "845123456",
    "referenciaOriginal": "ABC123",
    "novaReferencia": "ABC123D1",
    "dia": 1,
    "diasRestantes": 4,
    "proximaRenovacao": "2025-11-19T08:00:00.000Z",
    "timestamp": "2025-11-18T08:00:00.000Z"
  }
]
```

### Integração com Planilhas Google

#### Planilha de Pedidos
```javascript
{
  grupo_id: "120363355803754045@g.us",
  timestamp: "18/11/2025 10:00:00",
  transacao: "ABC123|2000|845123456",  // REF|MEGAS|NUMERO
  sender: "WhatsApp-Bot-Pacotes",
  message: "Pacote automatico: ABC123|2000|845123456"
}
```

#### Planilha de Pagamentos
```javascript
{
  grupo_id: "120363355803754045@g.us",
  timestamp: "18/11/2025 10:00:00",
  transacao: "ABC123|44|845123456",  // REF|VALOR|NUMERO
  sender: "WhatsApp-Bot-Pacotes",
  message: "Pacote automatico: Renovacao ABC123 - 44MT para 845123456"
}
```

---

## 📚 Exemplos Práticos

### Exemplo 1: Ativação Automática (Cliente Paga)

**Cenário:**
- Cliente paga comprovante de 2000MB por 44MT
- Sistema detecta como pacote de 5 dias

**Fluxo:**
1. Sistema recebe pagamento
2. Detecta 2000MB = 44MT na tabela de 5 dias
3. Chama `processarComprovante()` em modo automático
4. Cria pedido ABC123 (2000MB)
5. Cria pagamento ABC123 (44MT)
6. Registra cliente
7. Agenda 5 renovações (D1 a D5)
8. Envia notificação ao grupo

**Resultado:**
```
🎉 PACOTE AUTOMÁTICO ATIVADO!

📱 Número: 852118624
📦 Tipo: 5 Dias
📊 Pacote: 2000MB
💰 Valor: 44MT
📋 Referência: ABC123

🔄 Renovações Automáticas Agendadas:
   • Total: 5 renovações de 100MB
   • Primeira: 19/11/2025 às 08:00
   • Frequência: Diária (2h antes do horário anterior)

📅 Validade Total: Até 23/11/2025

✨ Total de dados: 2000MB + 500MB bônus = 2500MB!
```

---

### Exemplo 2: Ativação Manual (Admin)

**Cenário:**
- Admin enviou 1700MB manualmente para cliente
- Quer agendar 5 dias de renovações

**Passos:**
1. Admin envia pacote manualmente (via Tasker ou outro método)
2. Admin usa comando: `.pacote 5 ABC123 845123456`
3. Sistema registra cliente
4. Agenda 5 renovações (D1 a D5)

**Resultado:**
```
🎯 RENOVAÇÕES AGENDADAS!

📱 Número: 845123456
📋 Referência: ABC123
📅 Período: 5 dias
🔄 Renovações automáticas: 5x de 100MB (diárias, 2h antes)
📅 Expira em: 23/11/2025

⚠️ Lembrete: Você deve ter enviado o pacote principal manualmente!

💡 Verifique a validade com: .validade 845123456
```

---

### Exemplo 3: Consulta de Validade

**Cliente consulta:**
```bash
.validade 845123456
```

**Resposta do sistema:**
```
📱 VALIDADE DO PACOTE
━━━━━━━━━━━━━━━━━━━━━━━

📱 Número: 845123456
📋 Referência: ABC123
📦 Tipo: 5 Dias

📅 Status do Pacote:
   • Dias restantes: 3 dias
   • Renovações feitas: 2/5
   • Expira em: 3 dia(s) (21/11/2025)

🔄 Próxima Renovação (100MB):
   📅 19/11/2025 às 08:00

💡 Cada renovação adiciona 100MB válidos por 24h.
    O sistema renova automaticamente 2h antes do horário anterior.
```

---

## ⚙️ Configuração do Sistema

### Variáveis de Ambiente

```bash
# Ativar sistema de pacotes
SISTEMA_PACOTES_ENABLED=true

# Intervalo de verificação (ms) - padrão: 3600000 (1 hora)
VERIFICACAO_INTERVAL=3600000

# URL da planilha de pedidos (mesma do bot retalho)
GOOGLE_SHEETS_SCRIPT_URL_RETALHO=https://script.google.com/...

# URL da planilha de pagamentos (universal)
GOOGLE_SHEETS_PAGAMENTOS=https://script.google.com/...
```

### Inicialização

O sistema é inicializado automaticamente em `index.js`:

```javascript
// Inicializar sistema de pacotes
if (process.env.SISTEMA_PACOTES_ENABLED === 'true') {
    const SistemaPacotes = require('./sistema_pacotes');
    sistemaPacotes = new SistemaPacotes();
    console.log('✅ Sistema de Pacotes Automáticos ATIVADO');
}
```

---

## 🔧 Manutenção

### Verificação Manual de Renovações

```javascript
await sistemaPacotes.verificarRenovacoes();
```

### Listar Clientes Ativos (código)

```javascript
const clientes = sistemaPacotes.clientesAtivos;
console.log(clientes);
```

### Forçar Salvamento

```javascript
await sistemaPacotes.salvarDados();
```

### Limpar Histórico Antigo

O histórico é automaticamente limitado aos últimos 1000 registros ao salvar.

---

## 🐛 Tratamento de Erros

### Duplicatas

O sistema ignora pedidos/pagamentos duplicados:

```javascript
if (response.data.duplicado) {
    console.log(`⚠️ Pedido já existe - pulando criação`);
    return; // Continua sem erro
}
```

### Referências Duplicadas

```javascript
if (referenciaExiste) {
    return {
        sucesso: false,
        erro: 'Esta referência já foi utilizada para criar um pacote'
    };
}
```

### Erros de Conexão

Timeouts de 60 segundos para requisições às planilhas.

---

## 📊 Monitoramento

### Logs Importantes

```
📦 Processando pacote: ABC123 (Modo: MANUAL)
   📊 Pacote inicial: 2000MB por 44MT

✅ PACOTES: Referência ABC123 disponível para uso

📦 Criando pacote inicial: ABC123 (2000MB - 44MT)

✅ Cliente ativado com 5 Dias

💾 PACOTES: Dados salvos - 15 clientes ativos

🔄 PACOTES: Verificando renovações... (18/11/2025 10:00:00)

🔄 Processando renovação (3 dias)

✅ Renovação criada: ABC123D3 (2 dias)
   📅 Próxima: 20/11/2025
```

---

## 🚀 Melhorias Futuras

- [ ] Notificações 24h antes da expiração
- [ ] Dashboard web de monitoramento
- [ ] Relatórios mensais de renovações
- [ ] Integração com API de pagamentos
- [ ] Pausar/retomar pacotes
- [ ] Pacotes customizados por grupo
- [ ] Sistema de bônus por fidelidade

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do sistema
2. Consulte esta documentação
3. Revise os arquivos JSON de dados
4. Entre em contato com o desenvolvedor

---

**Documentação gerada em:** 18 de Novembro de 2025
**Versão do Sistema:** 1.0
**Última atualização:** Simplificação do comando .pacote
