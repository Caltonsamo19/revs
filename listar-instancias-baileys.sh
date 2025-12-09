#!/bin/bash

# Script para listar todas as instâncias Baileys
# Uso: ./listar-instancias-baileys.sh

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}   INSTÂNCIAS BAILEYS - LISTAGEM${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# Listar processos PM2 ativos
echo -e "${YELLOW}📊 Processos PM2 ativos:${NC}"
pm2 list | grep -v "baileys-test" | grep -E "online|stopped|errored" | grep -v "revs-" || echo "Nenhuma instância encontrada"
echo ""

# Listar diretórios de instâncias
echo -e "${YELLOW}📁 Diretórios de instâncias (excluindo wwebjs):${NC}"
for dir in /root/*/; do
    dirname=$(basename "$dir")
    # Pular diretórios conhecidos do sistema e instâncias wwebjs
    if [[ ! "$dirname" =~ ^(revs|revs-bot-|revs-baileys-test|dados_compartilhados|.pm2|.npm|.cache)$ ]]; then
        if [ -f "${dir}ecosystem.config.js" ] || [ -f "${dir}index.js" ]; then
            if [ -f "${dir}.env" ]; then
                instance_name=$(grep "INSTANCE_NAME=" "${dir}.env" 2>/dev/null | cut -d'=' -f2)
                if [ ! -z "$instance_name" ]; then
                    status="❓ Não iniciado"
                    if pm2 list | grep -q " $instance_name "; then
                        if pm2 list | grep " $instance_name " | grep -q "online"; then
                            status="✅ Online"
                        elif pm2 list | grep " $instance_name " | grep -q "stopped"; then
                            status="⏸️  Parado"
                        else
                            status="❌ Erro"
                        fi
                    fi
                    echo -e "  ${GREEN}${dirname}${NC} → ${status}"
                fi
            fi
        fi
    fi
done
echo ""

echo -e "${YELLOW}💡 Comandos úteis:${NC}"
echo -e "  Criar nova instância:    ${GREEN}./criar-instancia-baileys.sh <nome>${NC}"
echo -e "  Iniciar instância:       ${GREEN}cd /root/<nome> && pm2 start ecosystem.config.js${NC}"
echo -e "  Parar instância:         ${GREEN}pm2 stop <nome>${NC}"
echo -e "  Ver logs:                ${GREEN}pm2 logs <nome>${NC}"
echo -e "  Deletar instância PM2:   ${GREEN}pm2 delete <nome>${NC}"
echo ""
