# Sistema de Instâncias Baileys

Sistema de gerenciamento de múltiplas instâncias de bots WhatsApp usando a biblioteca Baileys.

## 📋 Características

- **Nome de instância customizado**: Cada instância usa seu próprio nome (ex: `junior`, `kelven`)
- **Dados compartilhados**: Todas as instâncias compartilham histórico de compradores, rankings, etc.
- **Isolamento**: Cada instância tem sua própria autenticação e sessão WhatsApp
- **Gerenciamento via PM2**: Processos gerenciados individualmente

## 📂 Estrutura de Diretórios

```
/root/
├── revs-baileys-test/          # Template base
│   ├── criar-instancia-baileys.sh
│   ├── listar-instancias-baileys.sh
│   ├── deletar-instancia-baileys.sh
│   └── ...outros arquivos
├── dados_compartilhados/        # Dados compartilhados entre instâncias
│   ├── historico_compradores.json
│   ├── ranking_diario_megas.json
│   └── ...outros arquivos
├── junior/                      # Instância "junior"
│   ├── index.js
│   ├── ecosystem.config.js
│   ├── .env
│   └── auth_baileys/           # Autenticação específica
└── kelven/                      # Instância "kelven"
    ├── index.js
    ├── ecosystem.config.js
    ├── .env
    └── auth_baileys/           # Autenticação específica
```

## 🚀 Comandos

### Criar Nova Instância

```bash
cd /root/revs-baileys-test
./criar-instancia-baileys.sh <nome>
```

**Exemplo:**
```bash
./criar-instancia-baileys.sh junior
```

Isso irá:
1. Criar diretório `/root/junior/`
2. Copiar todos os arquivos do template
3. Configurar `.env` com nome da instância
4. Criar `ecosystem.config.js` personalizado
5. Preparar para primeira execução

### Listar Instâncias

```bash
cd /root/revs-baileys-test
./listar-instancias-baileys.sh
```

Mostra:
- Processos PM2 ativos (excluindo wwebjs)
- Diretórios de instâncias detectados
- Status de cada instância

### Iniciar Instância

```bash
cd /root/<nome-instancia>
pm2 start ecosystem.config.js
```

**Exemplo:**
```bash
cd /root/junior
pm2 start ecosystem.config.js
```

### Ver Logs

```bash
pm2 logs <nome-instancia>
```

**Exemplo:**
```bash
pm2 logs junior
```

### Parar Instância

```bash
pm2 stop <nome-instancia>
```

### Reiniciar Instância

```bash
pm2 restart <nome-instancia>
```

### Deletar Instância

```bash
cd /root/revs-baileys-test
./deletar-instancia-baileys.sh <nome>
```

**IMPORTANTE:** Isso irá:
1. Parar e remover processo PM2
2. Criar backup em `/root/backup_instancias/`
3. Deletar diretório da instância

## 🔧 Configuração

### Arquivo .env (gerado automaticamente)

Cada instância tem seu próprio `.env`:

```bash
# Configuração da instância Baileys: junior
INSTANCE_NAME=junior
SHARED_DATA_DIR=/root/dados_compartilhados
SISTEMA_PACOTES_ENABLED=true

# OpenAI API (opcional)
# OPENAI_API_KEY=sua-chave-aqui

# MariaDB (compartilhado)
MARIADB_HOST=localhost
MARIADB_PORT=3306
MARIADB_USER=root
MARIADB_PASSWORD=sua-senha
MARIADB_DATABASE=whatsapp_bot
```

### ecosystem.config.js (gerado automaticamente)

```javascript
module.exports = {
  apps: [{
    name: 'junior',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      INSTANCE_NAME: 'junior',
      SHARED_DATA_DIR: '/root/dados_compartilhados'
    },
    error_file: '/root/.pm2/logs/junior-error.log',
    out_file: '/root/.pm2/logs/junior-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
```

## 📊 Dados Compartilhados

As seguintes informações são compartilhadas entre todas as instâncias:

- ✅ **Histórico de compradores** (`historico_compradores.json`)
- ✅ **Rankings** (diário, semanal, mensal)
- ✅ **Configurações de grupos** (`config_grupos.json`)
- ✅ **Sistema de pacotes automáticos**
- ✅ **Sistema de bônus**

### Dados Isolados (por instância)

- 🔒 **Autenticação WhatsApp** (`auth_baileys/`)
- 🔒 **Sessão ativa**
- 🔒 **Logs individuais**

## ⚠️ Importante

### Primeira Execução

Na primeira execução de uma nova instância:

1. O bot mostrará um **QR Code** no console
2. Escaneie com WhatsApp para conectar
3. A sessão ficará salva em `auth_baileys/`
4. Próximas execuções conectarão automaticamente

### Verificar QR Code

```bash
pm2 logs <nome-instancia>
```

### Backup Automático

Ao deletar uma instância com `deletar-instancia-baileys.sh`:
- Backup automático criado em `/root/backup_instancias/`
- Formato: `<nome>_YYYYMMDD_HHMMSS.tar.gz`

## 📝 Exemplos de Uso

### Criar e Iniciar Instância "Junior"

```bash
# 1. Criar instância
cd /root/revs-baileys-test
./criar-instancia-baileys.sh junior

# 2. Ir para diretório
cd /root/junior

# 3. Iniciar
pm2 start ecosystem.config.js

# 4. Ver QR Code e logs
pm2 logs junior
```

### Verificar Status de Todas Instâncias

```bash
cd /root/revs-baileys-test
./listar-instancias-baileys.sh
```

### Gerenciar Múltiplas Instâncias

```bash
# Listar todas
pm2 list

# Parar todas Baileys (exceto template)
pm2 stop junior kelven teste

# Reiniciar todas
pm2 restart junior kelven teste

# Ver logs de múltiplas
pm2 logs "junior|kelven"
```

## 🔍 Troubleshooting

### Instância não conecta

```bash
# Ver logs de erro
pm2 logs <nome> --err

# Deletar autenticação e reconectar
rm -rf /root/<nome>/auth_baileys
pm2 restart <nome>
```

### Dados compartilhados não funcionam

```bash
# Verificar permissões
ls -la /root/dados_compartilhados

# Verificar variável de ambiente
cat /root/<nome>/.env | grep SHARED_DATA_DIR
```

### Processo travado

```bash
# Parar e reiniciar
pm2 delete <nome>
cd /root/<nome>
pm2 start ecosystem.config.js
```

## 🎯 Diferenças vs wwebjs

| Aspecto | wwebjs | Baileys |
|---------|--------|---------|
| Nome de pasta | `revs-bot-01`, `revs-bot-02` | `junior`, `kelven` |
| Nome processo PM2 | `revs-almeida`, `revs-junior` | `junior`, `kelven` |
| Autenticação | `.wwebjs_auth/` | `auth_baileys/` |
| Template | `/root/revs/` | `/root/revs-baileys-test/` |

## 📞 Suporte

Para problemas ou dúvidas:
- Ver logs: `pm2 logs <nome>`
- Status: `pm2 status`
- Listar instâncias: `./listar-instancias-baileys.sh`
