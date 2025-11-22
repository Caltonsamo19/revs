#!/bin/bash

# ============================================================================
# SCRIPT DE INSTALAÇÃO - API MariaDB Bot Retalho
# Execute no servidor: bash install.sh
# ============================================================================

echo "============================================"
echo "🚀 Instalação da API MariaDB - Bot Retalho"
echo "============================================"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# 1. Atualizar sistema
echo -e "\n${GREEN}1. Atualizando sistema...${NC}"
apt update && apt upgrade -y

# 2. Instalar MariaDB
echo -e "\n${GREEN}2. Instalando MariaDB...${NC}"
apt install -y mariadb-server mariadb-client

# 3. Iniciar e habilitar MariaDB
systemctl start mariadb
systemctl enable mariadb

# 4. Configuração segura do MariaDB
echo -e "\n${GREEN}3. Configurando segurança do MariaDB...${NC}"
echo "Execute: mysql_secure_installation"
echo "Pressione Enter para continuar após executar o comando acima..."
read

# 5. Criar banco de dados e usuário
echo -e "\n${GREEN}4. Criando banco de dados...${NC}"
mysql -u root -p << EOF
CREATE DATABASE IF NOT EXISTS bot_retalho CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'bot_api'@'localhost' IDENTIFIED BY 'SuaSenhaSegura123!';
GRANT ALL PRIVILEGES ON bot_retalho.* TO 'bot_api'@'localhost';
FLUSH PRIVILEGES;
EOF

# 6. Executar schema
echo -e "\n${GREEN}5. Criando tabelas...${NC}"
mysql -u bot_api -p'SuaSenhaSegura123!' bot_retalho < schema.sql

# 7. Instalar Node.js (se não tiver)
if ! command -v node &> /dev/null; then
    echo -e "\n${GREEN}6. Instalando Node.js...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt install -y nodejs
fi

# 8. Instalar dependências
echo -e "\n${GREEN}7. Instalando dependências npm...${NC}"
npm install

# 9. Criar arquivo .env
echo -e "\n${GREEN}8. Criando arquivo .env...${NC}"
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Arquivo .env criado. Edite com suas configurações!"
else
    echo "⚠️ Arquivo .env já existe"
fi

# 10. Instalar PM2 para gerenciar o processo
echo -e "\n${GREEN}9. Instalando PM2...${NC}"
npm install -g pm2

# 11. Iniciar API com PM2
echo -e "\n${GREEN}10. Iniciando API...${NC}"
pm2 start server.js --name "bot-api"
pm2 save
pm2 startup

echo ""
echo "============================================"
echo "✅ Instalação concluída!"
echo "============================================"
echo ""
echo "📍 API rodando em: http://localhost:3002"
echo ""
echo "🔧 Próximos passos:"
echo "   1. Editar .env com suas configurações"
echo "   2. Testar: curl http://localhost:3002/health"
echo "   3. Atualizar URLs no Tasker"
echo ""
echo "📋 Comandos úteis:"
echo "   pm2 logs bot-api    - Ver logs"
echo "   pm2 restart bot-api - Reiniciar"
echo "   pm2 stop bot-api    - Parar"
echo ""
