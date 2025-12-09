#!/bin/bash

# Script para deletar instância Baileys
# Uso: ./deletar-instancia-baileys.sh <nome-instancia>

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$1" ]; then
    echo -e "${RED}❌ Erro: Nome da instância não fornecido${NC}"
    echo "Uso: ./deletar-instancia-baileys.sh <nome-instancia>"
    echo "Exemplo: ./deletar-instancia-baileys.sh junior"
    exit 1
fi

NOME_INSTANCIA=$(echo "$1" | tr '[:upper:]' '[:lower:]')
DIRETORIO_INSTANCIA="/root/${NOME_INSTANCIA}"

echo -e "${YELLOW}⚠️  ATENÇÃO: Você está prestes a deletar a instância '${NOME_INSTANCIA}'${NC}"
echo ""

# Verificar se instância existe
if [ ! -d "$DIRETORIO_INSTANCIA" ]; then
    echo -e "${RED}❌ Erro: Instância '${NOME_INSTANCIA}' não encontrada em ${DIRETORIO_INSTANCIA}${NC}"
    exit 1
fi

# Confirmação
read -p "Tem certeza que deseja deletar esta instância? (sim/não): " confirmacao

if [ "$confirmacao" != "sim" ]; then
    echo -e "${YELLOW}❌ Operação cancelada${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}🗑️  Deletando instância '${NOME_INSTANCIA}'...${NC}"
echo ""

# Parar processo PM2 se estiver rodando
if pm2 list | grep -q " $NOME_INSTANCIA "; then
    echo -e "${YELLOW}⏸️  Parando processo PM2...${NC}"
    pm2 stop "$NOME_INSTANCIA" 2>/dev/null
    pm2 delete "$NOME_INSTANCIA" 2>/dev/null
    echo -e "${GREEN}✅ Processo PM2 removido${NC}"
fi

# Fazer backup antes de deletar (opcional)
BACKUP_DIR="/root/backup_instancias"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${NOME_INSTANCIA}_${TIMESTAMP}.tar.gz"

echo -e "${YELLOW}📦 Criando backup em: ${BACKUP_FILE}${NC}"
tar -czf "$BACKUP_FILE" -C "/root" "$NOME_INSTANCIA" 2>/dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backup criado com sucesso${NC}"
else
    echo -e "${RED}⚠️  Falha ao criar backup (continuando mesmo assim...)${NC}"
fi

# Deletar diretório
echo -e "${YELLOW}🗑️  Removendo diretório: ${DIRETORIO_INSTANCIA}${NC}"
rm -rf "$DIRETORIO_INSTANCIA"

if [ ! -d "$DIRETORIO_INSTANCIA" ]; then
    echo ""
    echo -e "${GREEN}✅ Instância '${NOME_INSTANCIA}' deletada com sucesso!${NC}"
    echo -e "${YELLOW}📦 Backup disponível em: ${BACKUP_FILE}${NC}"
    echo ""
else
    echo -e "${RED}❌ Erro ao deletar diretório${NC}"
    exit 1
fi
