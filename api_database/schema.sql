-- ============================================================================
-- SCHEMA MARIADB - BOT WHATSAPP RETALHO
-- Substitui Google Sheets por banco de dados local
-- ============================================================================

-- Criar banco de dados
CREATE DATABASE IF NOT EXISTS bot_retalho CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bot_retalho;

-- ============================================================================
-- TABELA: PEDIDOS COMUNS
-- Formato: REF|MEGAS|NUMERO
-- ============================================================================
CREATE TABLE IF NOT EXISTS pedidos_comuns (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    referencia VARCHAR(100) NOT NULL,
    megas INT NOT NULL,
    numero VARCHAR(20) NOT NULL,
    transacao VARCHAR(255) NOT NULL,
    status ENUM('PENDENTE', 'PROCESSADO') DEFAULT 'PENDENTE',
    grupo_id VARCHAR(100) NOT NULL,
    sender VARCHAR(100),
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Índices para performance
    INDEX idx_referencia (referencia),
    INDEX idx_grupo_id (grupo_id),
    INDEX idx_status (status),
    INDEX idx_timestamp (timestamp),
    INDEX idx_grupo_status (grupo_id, status),

    -- Referência única para evitar duplicatas
    UNIQUE KEY unique_referencia (referencia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABELA: PEDIDOS DIAMANTE
-- Formato: REF|CODIGO|NUMERO
-- ============================================================================
CREATE TABLE IF NOT EXISTS pedidos_diamante (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    referencia VARCHAR(100) NOT NULL,
    codigo VARCHAR(10) NOT NULL,
    numero VARCHAR(20) NOT NULL,
    transacao VARCHAR(255) NOT NULL,
    status ENUM('PENDENTE', 'PROCESSADO') DEFAULT 'PENDENTE',
    grupo_id VARCHAR(100) NOT NULL,
    sender VARCHAR(100),
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Índices para performance
    INDEX idx_referencia (referencia),
    INDEX idx_grupo_id (grupo_id),
    INDEX idx_status (status),
    INDEX idx_timestamp (timestamp),
    INDEX idx_grupo_status (grupo_id, status),

    -- Referência única para evitar duplicatas
    UNIQUE KEY unique_referencia (referencia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- TABELA: PAGAMENTOS
-- Formato: REF|VALOR|NUMERO
-- ============================================================================
CREATE TABLE IF NOT EXISTS pagamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    referencia VARCHAR(100) NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    numero VARCHAR(20) NOT NULL,
    transacao VARCHAR(255) NOT NULL,
    status ENUM('PENDENTE', 'PROCESSADO') DEFAULT 'PENDENTE',
    grupo_id VARCHAR(100) NOT NULL,
    sender VARCHAR(100),
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Índices para performance
    INDEX idx_referencia (referencia),
    INDEX idx_grupo_id (grupo_id),
    INDEX idx_status (status),
    INDEX idx_timestamp (timestamp),
    INDEX idx_grupo_status (grupo_id, status),
    INDEX idx_referencia_valor (referencia, valor),

    -- Referência única para evitar duplicatas
    UNIQUE KEY unique_referencia (referencia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- VIEWS ÚTEIS PARA RELATÓRIOS
-- ============================================================================

-- View de pedidos das últimas 24h
CREATE OR REPLACE VIEW v_pedidos_24h AS
SELECT * FROM pedidos_comuns
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR);

-- View de pagamentos das últimas 24h
CREATE OR REPLACE VIEW v_pagamentos_24h AS
SELECT * FROM pagamentos
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR);

-- View de pedidos diamante das últimas 24h
CREATE OR REPLACE VIEW v_diamante_24h AS
SELECT * FROM pedidos_diamante
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR);

-- ============================================================================
-- USUÁRIO DA API (criar usuário específico para a aplicação)
-- ============================================================================
-- CREATE USER IF NOT EXISTS 'bot_api'@'localhost' IDENTIFIED BY 'SuaSenhaSegura123!';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON bot_retalho.* TO 'bot_api'@'localhost';
-- FLUSH PRIVILEGES;
