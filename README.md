# Bot WhatsApp REVS

Bot de WhatsApp para gestão de pedidos, pagamentos e sistema de referências.

## 📁 Estrutura de Arquivos

### Arquivos Principais
- **index.js** - Arquivo principal do bot (10016 linhas)
- **package.json** - Dependências do projeto
- **ecosystem.config.js** - Configuração PM2

### Módulos do Sistema
- **sistema_compras.js** - Gestão de pedidos e backups
- **sistema_pacotes.js** - Gestão de pacotes e produtos
- **sistema_relatorios.js** - Relatórios e estatísticas
- **sistema_config_grupos.js** - Configuração de grupos
- **sistema_bonus.js** - Sistema de bônus
- **whatsapp_ai.js** - Integração com IA

### Diretório API
- **api_database/** - API REST local (MariaDB)

## 🚀 Como Executar

### No Servidor (PM2)
```bash
pm2 start ecosystem.config.js
pm2 status
pm2 logs revs
```

### Localmente (Dev)
```bash
npm install
npm start
```

## ⚙️ Otimizações Aplicadas

✅ **Memória**: LRU Cache implementado  
✅ **PM2**: Fork mode com --expose-gc  
✅ **Backups**: Sistema rotativo (max 10 arquivos)  
✅ **Limpeza**: GC automático a cada 30min  

## 📊 Status Atual

- **Uptime**: 8+ horas estável
- **Restarts**: 2 total (vs 61 em 76min antes)
- **Memória**: 68% heap (vs 86% antes)
- **Backups**: 20MB (vs 31GB antes)

## 🔧 Comandos Administrativos

- `.status` / `.ping` - Status do bot
- `.memory` / `.mem` - Uso de memória
- `.limpar` - Forçar limpeza de cache

## 📝 Notas

- Versão sincronizada com servidor em 27/11/2025
- Modo fork (não cluster) para WhatsApp
- Garbage Collection habilitado
- Backup rotativo implementado
