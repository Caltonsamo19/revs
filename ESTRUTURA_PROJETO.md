# 📁 Estrutura do Projeto - Bot WhatsApp REVS

**Data de Sincronização**: 27/11/2025  
**Status**: Local sincronizado com servidor (5.182.33.81)

---

## 🎯 Arquivos Principais (Raiz)

| Arquivo | Tamanho | Descrição |
|---------|---------|-----------|
| **index.js** | 421 KB | Arquivo principal do bot - 10.016 linhas |
| **package.json** | 422 B | Dependências do projeto |
| **package-lock.json** | 96 KB | Lock de dependências |
| **ecosystem.config.js** | 1.3 KB | Configuração PM2 (fork mode, GC enabled) |
| **README.md** | 1.6 KB | Documentação geral |
| **.gitignore** | - | Arquivos a ignorar no Git |

---

## 🔧 Módulos do Sistema

| Módulo | Tamanho | Função |
|--------|---------|--------|
| **sistema_compras.js** | 98 KB | Gestão de pedidos e backup rotativo |
| **sistema_pacotes.js** | 40 KB | Gestão de pacotes e produtos |
| **sistema_relatorios.js** | 23 KB | Relatórios e estatísticas |
| **sistema_config_grupos.js** | 15 KB | Configuração de grupos |
| **sistema_bonus.js** | 12 KB | Sistema de bônus e referências |
| **whatsapp_ai.js** | 99 KB | Integração com OpenAI |

---

## 📂 Diretórios

### `api_database/`
API REST local com MariaDB

```
api_database/
├── server.js              # Servidor Express
├── database.js            # Conexão MariaDB
├── schema.sql             # Schema do banco
├── package.json           # Dependências da API
├── install.sh             # Script de instalação
├── routes/
│   ├── pedidos_comuns.js
│   ├── pedidos_diamante.js
│   └── pagamentos.js
├── README.md              # Documentação da API
└── MIGRACAO.md            # Guia de migração
```

### `backup_historico/`
Backups rotativos (máx 10 arquivos, 1x/hora)

---

## 🚫 Arquivos Removidos (Limpeza)

Arquivos temporários e guias removidos:
- ❌ `limpar_backups.js` - Script de limpeza (já aplicado)
- ❌ `sistema_compras_OTIMIZADO.js` - Guia de otimização
- ❌ `index_OTIMIZADO_LRU.js` - Guia LRU Cache
- ❌ `GUIA_OTIMIZACAO.md` - Manual de 58 páginas
- ❌ `RESUMO_OTIMIZACOES.md` - Resumo executivo
- ❌ `verificar_otimizacoes.js` - Script de verificação
- ❌ `README_OTIMIZACOES.md` - Documentação
- ❌ `COMECE_AQUI.txt` - Arquivo de boas-vindas
- ❌ `deploy_otimizacoes.sh` - Script de deploy
- ❌ `ANTI_BAN_SMART_DELAY.js` - Implementação anti-ban
- ❌ `EXEMPLO_APLICACAO_ANTI_BAN.md` - Exemplos
- ❌ `ANTI_BAN_INVISIVEL.js` - Versão simplificada
- ❌ Arquivos `*_SERVIDOR.js` - Comparações temporárias

---

## ✅ Otimizações Aplicadas no Servidor

### Memória
- ✅ LRU Cache implementado
- ✅ Garbage Collection habilitado (`--expose-gc`)
- ✅ Limpeza automática a cada 30 minutos
- ✅ Heap usage: **86% → 68%** (estável)

### Estabilidade
- ✅ PM2 em modo **fork** (ideal para WhatsApp)
- ✅ Restarts: **61 em 76min → 2 em 8h** (97% melhoria)
- ✅ Uptime: **1.2min → 8+ horas** (400x melhoria)

### Backups
- ✅ Sistema rotativo: máx 10 arquivos
- ✅ Frequência: 1x por hora (em vez de a cada save)
- ✅ Espaço em disco: **31GB → 20MB** (98% redução)

### PM2 Configuration
```javascript
{
  exec_mode: 'fork',              // WhatsApp requer sessão única
  node_args: '--expose-gc',        // Habilita garbage collection
  max_memory_restart: '1800M',     // Restart se > 1.8GB
  cron_restart: '0 4 * * *',       // Restart diário às 4h
}
```

---

## 📊 Dependências

### Bot Principal
- `whatsapp-web.js` - Fork custom (fix-getContact)
- `axios` - Requisições HTTP
- `openai` - Integração GPT
- `node-cron` - Tarefas agendadas
- `qrcode-terminal` - QR Code no terminal
- `dotenv` - Variáveis de ambiente
- `lru-cache` - Cache com auto-limpeza

### API Database
- `express` - Servidor HTTP
- `mariadb` - Cliente MariaDB
- `cors` - CORS middleware
- `dotenv` - Variáveis de ambiente

---

## 🔐 Arquivos de Dados (não versionados)

Estes arquivos existem no servidor mas não devem ser versionados:

```
comandos_customizados.json
compras_pendentes.json
config_grupos.json
config_relatorios.json
dados_bonus.json
dados_codigos.json
dados_membros_entrada.json
dados_pacotes_clientes.json
dados_referencias.json
dados_saques.json
gatilhos_automaticos.json
historico_compradores.json
mensagens_ranking.json
pagamentos_pendentes.json
ranking_diario.json
ranking_diario_megas.json
ranking_mensal.json
ranking_semanal.json
```

---

## 🚀 Como Usar

### Instalar Dependências
```bash
npm install
cd api_database && npm install
```

### Executar Localmente
```bash
npm start
```

### Deploy no Servidor
```bash
# Fazer backup
ssh root@5.182.33.81 "cd /root/revs && cp index.js index.js.backup"

# Enviar arquivos
scp index.js root@5.182.33.81:/root/revs/
scp sistema_*.js root@5.182.33.81:/root/revs/

# Reiniciar
ssh root@5.182.33.81 "pm2 restart revs"
```

### Monitorar no Servidor
```bash
pm2 status revs
pm2 logs revs --lines 50
pm2 monit
```

---

## 📝 Comandos do Bot

### Administrativos
- `.status` / `.ping` - Status do bot
- `.memory` / `.mem` - Uso de memória
- `.limpar` - Forçar limpeza de cache

### Sistema
- `.help` - Lista de comandos
- `.config` - Configurações do grupo
- `.relatorio` - Relatório de vendas

---

## 🎯 Próximos Passos (Pendentes)

1. **Anti-Ban System** (aguardando implementação)
   - Delays aleatórios 0.8-2.5s
   - Sem alterar formato das mensagens
   - Processamento continua rápido

2. **Otimizações Opcionais**
   - LRU Cache no index.js (já preparado)
   - Backup otimizado no sistema_compras.js (já preparado)

---

**Última atualização**: 27/11/2025 18:15  
**Versão sincronizada**: Servidor 5.182.33.81 ✅
