# API MariaDB - Bot WhatsApp Retalho

Substitui Google Sheets por banco de dados MariaDB local. **100% compatível com Tasker** - apenas mude a URL.

## Instalação Rápida

```bash
# No servidor
cd /root/api_database
bash install.sh
```

## URLs para Tasker

### Antes (Google Sheets)
```
Pedidos:    https://script.google.com/macros/s/AKfycby.../exec
Diamante:   https://script.google.com/macros/s/AKfycbw.../exec
Pagamentos: https://script.google.com/macros/s/AKfycby.../exec
```

### Depois (MariaDB)
```
Pedidos:    http://5.182.33.81:3002/api/pedidos
Diamante:   http://5.182.33.81:3002/api/diamante
Pagamentos: http://5.182.33.81:3002/api/pagamentos
```

## Endpoints

Todos os endpoints mantêm o mesmo formato de request/response do Google Apps Script.

### Pedidos Comuns (`/api/pedidos`)

| Action | Descrição |
|--------|-----------|
| (nenhuma) | Inserir novo pedido |
| `buscar_pendentes` | Buscar pedidos pendentes |
| `confirmar_recebimento` | Marcar como processado |
| `reverter_pendentes` | Reverter para pendente |
| `buscar_pedidos_24h` | Relatório 24h |

### Pagamentos (`/api/pagamentos`)

| Action | Descrição |
|--------|-----------|
| (nenhuma) | Inserir novo pagamento |
| `buscar_por_referencia` | Buscar pagamento |
| `marcar_processado` | Marcar como processado |
| `buscar_pendentes` | Buscar pendentes |
| `buscar_pagamentos_24h` | Relatório 24h |

## Exemplos de Uso (Tasker)

### Inserir Pedido
```json
POST /api/pedidos
{
  "transacao": "REF123|1024|848715208",
  "grupo_id": "258820749141-1441573529@g.us",
  "sender": "WhatsApp-Bot",
  "message": "Pedido original"
}
```

### Buscar Pendentes
```json
POST /api/pedidos
{
  "action": "buscar_pendentes",
  "grupo_id": "258820749141-1441573529@g.us"
}
```

### Confirmar Recebimento
```json
POST /api/pedidos
{
  "action": "confirmar_recebimento",
  "referencias": ["REF123", "REF124"],
  "grupo_id": "258820749141-1441573529@g.us"
}
```

## Comandos Úteis

```bash
# Ver logs
pm2 logs bot-api

# Reiniciar
pm2 restart bot-api

# Status
pm2 status

# Health check
curl http://localhost:3002/health
```

## Performance

| Operação | Google Sheets | MariaDB |
|----------|---------------|---------|
| Inserir | 1-3s | 5-20ms |
| Buscar | 2-5s | 10-50ms |
| Atualizar | 1-2s | 5-10ms |

**~100x mais rápido!**
