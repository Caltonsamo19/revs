#!/bin/bash

# Script para criar nova instância Baileys
# Uso: ./criar-instancia-baileys.sh <nome-instancia>

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

if [ -z "$1" ]; then
    echo -e "${RED}❌ Erro: Nome da instância não fornecido${NC}"
    echo "Uso: ./criar-instancia-baileys.sh <nome-instancia>"
    echo "Exemplo: ./criar-instancia-baileys.sh junior"
    exit 1
fi

NOME_INSTANCIA=$(echo "$1" | tr '[:upper:]' '[:lower:]')
DIRETORIO_BASE="/root"
DIRETORIO_TEMPLATE="/root/revs-baileys-test"
DIRETORIO_INSTANCIA="${DIRETORIO_BASE}/${NOME_INSTANCIA}"
DADOS_COMPARTILHADOS="/root/dados_compartilhados"

echo -e "${YELLOW}📦 Criando instância Baileys: ${NOME_INSTANCIA}${NC}"
echo ""

# Verificar se instância já existe
if [ -d "$DIRETORIO_INSTANCIA" ]; then
    echo -e "${RED}❌ Erro: Instância '${NOME_INSTANCIA}' já existe em ${DIRETORIO_INSTANCIA}${NC}"
    exit 1
fi

# Verificar se template existe
if [ ! -d "$DIRETORIO_TEMPLATE" ]; then
    echo -e "${RED}❌ Erro: Diretório template não encontrado: ${DIRETORIO_TEMPLATE}${NC}"
    exit 1
fi

# Verificar se dados compartilhados existem
if [ ! -d "$DADOS_COMPARTILHADOS" ]; then
    echo -e "${YELLOW}⚠️  Criando diretório de dados compartilhados...${NC}"
    mkdir -p "$DADOS_COMPARTILHADOS"
fi

echo -e "${GREEN}✅ Verificações iniciais concluídas${NC}"
echo ""

# Criar diretório da instância
echo -e "${YELLOW}📁 Criando diretório: ${DIRETORIO_INSTANCIA}${NC}"
mkdir -p "$DIRETORIO_INSTANCIA"

# Copiar arquivos do template
echo -e "${YELLOW}📋 Copiando arquivos do template...${NC}"
cp -r "${DIRETORIO_TEMPLATE}"/* "${DIRETORIO_INSTANCIA}/"

# Remover pasta de autenticação do template (cada instância terá a sua)
if [ -d "${DIRETORIO_INSTANCIA}/auth_baileys" ]; then
    echo -e "${YELLOW}🗑️  Removendo dados de autenticação do template...${NC}"
    rm -rf "${DIRETORIO_INSTANCIA}/auth_baileys"
fi

# NOVO: Remover arquivos JSON locais que devem usar dados compartilhados
echo -e "${YELLOW}🗑️  Removendo arquivos JSON locais (usarão dados compartilhados)...${NC}"
rm -f "${DIRETORIO_INSTANCIA}/historico_compradores.json"
rm -f "${DIRETORIO_INSTANCIA}/ranking_diario.json"
rm -f "${DIRETORIO_INSTANCIA}/ranking_semanal.json"
rm -f "${DIRETORIO_INSTANCIA}/ranking_mensal.json"
rm -f "${DIRETORIO_INSTANCIA}/ranking_diario_megas.json"
rm -f "${DIRETORIO_INSTANCIA}/compras_pendentes.json"
rm -f "${DIRETORIO_INSTANCIA}/mensagens_ranking.json"

# Criar arquivo .env específico da instância
echo -e "${YELLOW}⚙️  Configurando .env da instância...${NC}"
cat > "${DIRETORIO_INSTANCIA}/.env" << EOF
# Configuração da instância Baileys: ${NOME_INSTANCIA}
INSTANCE_NAME=${NOME_INSTANCIA}
SHARED_DATA_DIR=${DADOS_COMPARTILHADOS}
SISTEMA_PACOTES_ENABLED=true

# OpenAI API (opcional)
# OPENAI_API_KEY=sua-chave-aqui

# MariaDB (compartilhado)
MARIADB_HOST=localhost
MARIADB_PORT=3306
MARIADB_USER=root
MARIADB_PASSWORD=sua-senha
MARIADB_DATABASE=whatsapp_bot
EOF

# Criar ecosystem.config.js específico
echo -e "${YELLOW}⚙️  Criando configuração PM2...${NC}"
cat > "${DIRETORIO_INSTANCIA}/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: '${NOME_INSTANCIA}',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      INSTANCE_NAME: '${NOME_INSTANCIA}',
      SHARED_DATA_DIR: '${DADOS_COMPARTILHADOS}'
    },
    error_file: '/root/.pm2/logs/${NOME_INSTANCIA}-error.log',
    out_file: '/root/.pm2/logs/${NOME_INSTANCIA}-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

echo ""
echo -e "${GREEN}✅ Instância '${NOME_INSTANCIA}' criada com sucesso!${NC}"
echo ""
echo -e "${YELLOW}📍 Diretório: ${DIRETORIO_INSTANCIA}${NC}"
echo -e "${YELLOW}📊 Dados compartilhados: ${DADOS_COMPARTILHADOS}${NC}"
echo ""
echo -e "${YELLOW}Para iniciar a instância:${NC}"
echo -e "  cd ${DIRETORIO_INSTANCIA}"
echo -e "  pm2 start ecosystem.config.js"
echo ""
echo -e "${YELLOW}Para verificar logs:${NC}"
echo -e "  pm2 logs ${NOME_INSTANCIA}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANTE: Escaneie o QR Code na primeira execução!${NC}"
echo ""
