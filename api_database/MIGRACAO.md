# Guia de Migração - Google Sheets para MariaDB

## Passo 1: Instalar API no Servidor

```bash
# Copiar pasta api_database para o servidor
scp -r api_database root@5.182.33.81:/root/

# No servidor
cd /root/api_database
bash install.sh
```

## Passo 2: Atualizar .env do Bot

Adicione as novas variáveis no arquivo `.env`:

```env
# === API MARIADB (substitui Google Sheets) ===
API_DATABASE_URL=http://localhost:3002
API_PEDIDOS_URL=http://localhost:3002/api/pedidos
API_DIAMANTE_URL=http://localhost:3002/api/diamante
API_PAGAMENTOS_URL=http://localhost:3002/api/pagamentos
```

## Passo 3: Atualizar index.js

### Alterar configurações (linha ~182)

**Antes:**
```javascript
const GOOGLE_SHEETS_CONFIG = {
    scriptUrl: process.env.GOOGLE_SHEETS_SCRIPT_URL_RETALHO || 'https://script.google.com/macros/s/AKfycby.../exec',
    // ...
};
```

**Depois:**
```javascript
const GOOGLE_SHEETS_CONFIG = {
    scriptUrl: process.env.API_PEDIDOS_URL || 'http://localhost:3002/api/pedidos',
    planilhaUrl: 'http://localhost:3002', // Local
    planilhaId: 'mariadb',
    timeout: 10000, // Reduzido de 30000 (muito mais rápido)
    retryAttempts: 3,
    retryDelay: 1000 // Reduzido de 2000
};
```

### Alterar config Diamante (linha ~192)

**Antes:**
```javascript
const GOOGLE_SHEETS_CONFIG_DIAMANTE = {
    scriptUrl: process.env.GOOGLE_SHEETS_SCRIPT_URL_DIAMANTE || 'https://script.google.com/macros/s/AKfycbw.../exec',
    // ...
};
```

**Depois:**
```javascript
const GOOGLE_SHEETS_CONFIG_DIAMANTE = {
    scriptUrl: process.env.API_DIAMANTE_URL || 'http://localhost:3002/api/diamante',
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000
};
```

### Alterar config Pagamentos (linha ~220)

**Antes:**
```javascript
const PAGAMENTOS_CONFIG = {
    scriptUrl: 'https://script.google.com/macros/s/AKfycbzz.../exec',
    timeout: 30000
};
```

**Depois:**
```javascript
const PAGAMENTOS_CONFIG = {
    scriptUrl: process.env.API_PAGAMENTOS_URL || 'http://localhost:3002/api/pagamentos',
    timeout: 10000
};
```

## Passo 4: Atualizar Tasker

No Tasker, apenas mude as URLs:

| Tipo | URL Antiga | URL Nova |
|------|------------|----------|
| Pedidos | `https://script.google.com/.../exec` | `http://5.182.33.81:3002/api/pedidos` |
| Diamante | `https://script.google.com/.../exec` | `http://5.182.33.81:3002/api/diamante` |
| Pagamentos | `https://script.google.com/.../exec` | `http://5.182.33.81:3002/api/pagamentos` |

**O corpo do request e a resposta são idênticos!**

## Passo 5: Testar

```bash
# Health check
curl http://5.182.33.81:3002/health

# Teste de inserção
curl -X POST http://5.182.33.81:3002/api/pedidos \
  -H "Content-Type: application/json" \
  -d '{"transacao":"TEST123|1024|848715208","grupo_id":"test","sender":"teste","message":"teste"}'

# Teste de busca pendentes
curl -X POST http://5.182.33.81:3002/api/pedidos \
  -H "Content-Type: application/json" \
  -d '{"action":"buscar_pendentes","grupo_id":"test"}'
```

## Rollback (se precisar voltar)

Basta reverter as URLs no `.env` e `index.js` para os valores originais do Google Sheets.

## Benefícios Após Migração

- ✅ **100x mais rápido** (ms vs segundos)
- ✅ **Sem rate limits** (erro 429)
- ✅ **Sem timeouts** de 30s
- ✅ **Funciona offline** (sem depender da internet)
- ✅ **Dados locais** (mais seguro)
