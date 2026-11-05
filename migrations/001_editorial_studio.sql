-- Editorial Studio schema. Additive only; safe to run more than once.
-- Existing news_v2 rows remain the immutable discovery/source records.
CREATE TABLE IF NOT EXISTS editorial_articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  news_id INT NOT NULL,
  headline VARCHAR(500) NULL,
  subtitle VARCHAR(1000) NULL,
  tldr TEXT NULL,
  content_json JSON NULL,
  rendered_html LONGTEXT NULL,
  editorial_status ENUM('draft','review','approved','rejected','archived') NOT NULL DEFAULT 'draft',
  current_version INT UNSIGNED NOT NULL DEFAULT 1,
  approved_at DATETIME NULL,
  approved_by VARCHAR(255) NULL,
  created_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_editorial_articles_news (news_id),
  KEY idx_editorial_articles_status_updated (editorial_status, updated_at),
  CONSTRAINT fk_editorial_articles_news FOREIGN KEY (news_id) REFERENCES news_v2(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS editorial_editions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  edition_date DATE NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  title VARCHAR(255) NOT NULL,
  intro TEXT NULL,
  closing TEXT NULL,
  status ENUM('draft','editing','ready_for_review','approved','scheduled','sending','sent','cancelled','failed') NOT NULL DEFAULT 'draft',
  scheduled_at DATETIME NULL,
  approved_at DATETIME NULL,
  approved_by VARCHAR(255) NULL,
  sent_at DATETIME NULL,
  created_by VARCHAR(255) NULL,
  updated_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_editorial_editions_date_timezone (edition_date, timezone),
  KEY idx_editorial_editions_status_schedule (status, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS editorial_edition_articles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  edition_id BIGINT UNSIGNED NOT NULL,
  article_id BIGINT UNSIGNED NOT NULL,
  position INT UNSIGNED NOT NULL,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_editorial_edition_article (edition_id, article_id),
  UNIQUE KEY uq_editorial_edition_position (edition_id, position),
  KEY idx_editorial_edition_articles_article (article_id),
  CONSTRAINT fk_editorial_edition_articles_edition FOREIGN KEY (edition_id) REFERENCES editorial_editions(id) ON DELETE CASCADE,
  CONSTRAINT fk_editorial_edition_articles_article FOREIGN KEY (article_id) REFERENCES editorial_articles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS editorial_article_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  article_id BIGINT UNSIGNED NOT NULL,
  version INT UNSIGNED NOT NULL,
  snapshot_json JSON NOT NULL,
  changed_by VARCHAR(255) NULL,
  change_type VARCHAR(50) NOT NULL DEFAULT 'edit',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_editorial_article_version (article_id, version),
  CONSTRAINT fk_editorial_article_versions_article FOREIGN KEY (article_id) REFERENCES editorial_articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS editorial_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  article_id BIGINT UNSIGNED NULL,
  edition_id BIGINT UNSIGNED NULL,
  asset_type ENUM('image','gif','other') NOT NULL DEFAULT 'image',
  public_url VARCHAR(2048) NOT NULL,
  fallback_url VARCHAR(2048) NULL,
  mime_type VARCHAR(127) NOT NULL,
  original_name VARCHAR(255) NULL,
  file_size_bytes BIGINT UNSIGNED NULL,
  width_px INT UNSIGNED NULL,
  height_px INT UNSIGNED NULL,
  alt_text VARCHAR(500) NULL,
  caption TEXT NULL,
  uploaded_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_editorial_assets_article (article_id),
  KEY idx_editorial_assets_edition (edition_id),
  CONSTRAINT fk_editorial_assets_article FOREIGN KEY (article_id) REFERENCES editorial_articles(id) ON DELETE SET NULL,
  CONSTRAINT fk_editorial_assets_edition FOREIGN KEY (edition_id) REFERENCES editorial_editions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS editorial_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor VARCHAR(255) NULL,
  action VARCHAR(64) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  details_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_editorial_audit_entity (entity_type, entity_id, created_at),
  KEY idx_editorial_audit_actor (actor, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS news_discovery_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  source_id INT NULL,
  query_text VARCHAR(500) NULL,
  started_at DATETIME NOT NULL,
  completed_at DATETIME NULL,
  results_count INT UNSIGNED NOT NULL DEFAULT 0,
  inserted_count INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  rejected_count INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('running','success','partial','failed') NOT NULL DEFAULT 'running',
  error_message TEXT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_news_discovery_provider_time (provider, started_at),
  KEY idx_news_discovery_status_time (status, started_at),
  CONSTRAINT fk_news_discovery_source FOREIGN KEY (source_id) REFERENCES news_sources(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One source observation per canonical URL; article content remains in news_v2.
CREATE TABLE IF NOT EXISTS news_discovery_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  news_id INT NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_item_id VARCHAR(255) NULL,
  canonical_url VARCHAR(700) NOT NULL,
  source_domain VARCHAR(255) NOT NULL,
  dedupe_status ENUM('unique','exact_duplicate','possible_duplicate') NOT NULL DEFAULT 'unique',
  duplicate_of_news_id INT NULL,
  discovered_at DATETIME NOT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_news_discovery_provider_url (provider, canonical_url),
  KEY idx_news_discovery_records_news (news_id),
  KEY idx_news_discovery_records_discovered (discovered_at),
  KEY idx_news_discovery_records_dedupe (dedupe_status, discovered_at),
  CONSTRAINT fk_news_discovery_records_news FOREIGN KEY (news_id) REFERENCES news_v2(id) ON DELETE RESTRICT,
  CONSTRAINT fk_news_discovery_records_duplicate FOREIGN KEY (duplicate_of_news_id) REFERENCES news_v2(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS newsletter_send_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  edition_id BIGINT UNSIGNED NOT NULL,
  recipient_email VARCHAR(255) NOT NULL,
  status ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending',
  resend_message_id VARCHAR(128) NULL,
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  started_at DATETIME NULL,
  sent_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_newsletter_send_recipient (edition_id, recipient_email),
  KEY idx_newsletter_send_status (edition_id, status),
  CONSTRAINT fk_newsletter_send_edition FOREIGN KEY (edition_id) REFERENCES editorial_editions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
