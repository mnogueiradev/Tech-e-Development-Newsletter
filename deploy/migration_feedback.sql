-- =========================================================================
-- Migração de Banco de Dados: Sistema de Feedback por Notícia e Token de Inscrito
-- Compatível com MySQL 8.0+, TiDB e MariaDB
-- =========================================================================

-- 1. Verifica e adiciona a coluna 'token' na tabela 'subscribers'
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'subscribers'
    AND COLUMN_NAME = 'token'
);

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE subscribers ADD COLUMN token VARCHAR(36) UNIQUE',
  'SELECT "Coluna token já existe" AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Preenche UUID para inscritos antigos que não possuem token
UPDATE subscribers SET token = UUID() WHERE token IS NULL OR token = '';

-- 3. Torna a coluna NOT NULL após preencher os dados existentes
ALTER TABLE subscribers MODIFY token VARCHAR(36) NOT NULL;

-- 4. Criação da tabela de feedback por notícia (upvote / downvote)
CREATE TABLE IF NOT EXISTS news_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  news_id INT NOT NULL,
  subscriber_id INT NOT NULL,
  vote ENUM('up', 'down') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_vote (news_id, subscriber_id),
  FOREIGN KEY (news_id) REFERENCES news_v2(id) ON DELETE CASCADE,
  FOREIGN KEY (subscriber_id) REFERENCES subscribers(id) ON DELETE CASCADE
);
