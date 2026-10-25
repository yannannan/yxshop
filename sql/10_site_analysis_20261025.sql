-- 综合看板：在应用当前使用的 MySQL 库执行。可重复执行；不清空数据、不修改收费配置。
CREATE TABLE IF NOT EXISTS site_analysis_sites (
 id VARCHAR(36) NOT NULL, user_id BIGINT NOT NULL, host VARCHAR(253) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL, url VARCHAR(1024) NOT NULL,
 created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uq_analysis_site(user_id,host), KEY idx_analysis_sites_user(user_id,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS site_analysis_runs (
 id VARCHAR(36) NOT NULL, site_id VARCHAR(36) NOT NULL, user_id BIGINT NOT NULL, product_id BIGINT NOT NULL,
 host VARCHAR(253) NOT NULL, source_url VARCHAR(1024) NOT NULL, request_hash CHAR(64) NOT NULL, options_json TEXT NOT NULL,
 billing_mode VARCHAR(20) NOT NULL, points_cost INT NOT NULL DEFAULT 0,
 status VARCHAR(20) NOT NULL DEFAULT 'queued', progress INT NOT NULL DEFAULT 0, stage VARCHAR(40) NOT NULL DEFAULT '',
 attempts INT NOT NULL DEFAULT 0, claim_token VARCHAR(36) NOT NULL DEFAULT '', lease_until VARCHAR(40) NOT NULL DEFAULT '',
 draft_json LONGTEXT NOT NULL, error_message VARCHAR(500) NOT NULL DEFAULT '', charged TINYINT NOT NULL DEFAULT 0,
 points_spent INT NOT NULL DEFAULT 0, billing_order_id VARCHAR(96) NOT NULL DEFAULT '',
 created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL, completed_at VARCHAR(40) NOT NULL DEFAULT '',
 PRIMARY KEY(id), KEY idx_analysis_queue(status,lease_until,created_at), KEY idx_analysis_run_user(user_id,product_id,created_at),
 KEY idx_analysis_run_site(user_id,site_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS site_analysis_reports (
 run_id VARCHAR(36) NOT NULL, user_id BIGINT NOT NULL, site_id VARCHAR(36) NOT NULL, report_json LONGTEXT NOT NULL,
 created_at VARCHAR(40) NOT NULL, PRIMARY KEY(run_id), KEY idx_analysis_report_owner(user_id,site_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS site_analysis_pages (
 run_id VARCHAR(36) NOT NULL, url_hash CHAR(64) NOT NULL, url TEXT NOT NULL, page_json MEDIUMTEXT NOT NULL,
 PRIMARY KEY(run_id,url_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS site_analysis_keywords (
 run_id VARCHAR(36) NOT NULL, word_hash CHAR(64) NOT NULL, keyword VARCHAR(320) NOT NULL,
 kind VARCHAR(20) NOT NULL, score INT NOT NULL, sources_json TEXT NOT NULL, PRIMARY KEY(run_id,word_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS site_analysis_rankings (
 run_id VARCHAR(36) NOT NULL, engine VARCHAR(20) NOT NULL, word_hash CHAR(64) NOT NULL,
 keyword VARCHAR(320) NOT NULL, state VARCHAR(20) NOT NULL, position INT NULL, url TEXT NOT NULL,
 source_url TEXT NOT NULL, checked_at VARCHAR(40) NOT NULL, message VARCHAR(500) NOT NULL,
 PRIMARY KEY(run_id,engine,word_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS site_analysis_events (
 id BIGINT NOT NULL AUTO_INCREMENT, run_id VARCHAR(36) NOT NULL, stage VARCHAR(40) NOT NULL,
 state VARCHAR(20) NOT NULL, message VARCHAR(500) NOT NULL, created_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(id), KEY idx_analysis_event_run(run_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS site_analysis_workers (
 id VARCHAR(36) NOT NULL, heartbeat_at VARCHAR(40) NOT NULL, PRIMARY KEY(id), KEY idx_analysis_worker_health(heartbeat_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS site_analysis_issue_actions (
 run_id VARCHAR(36) NOT NULL, user_id BIGINT NOT NULL, issue_key CHAR(64) NOT NULL,
 state VARCHAR(20) NOT NULL DEFAULT 'pending', updated_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(run_id,user_id,issue_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- 仅补齐已有站长工具的空入口，已有 slug、价格、积分、套餐与状态保持原值。
UPDATE products SET tool_url=CONCAT('/tools/',tool_slug,'.html')
WHERE product_type='tool' AND (name='站长分析工具' OR tool_slug IN ('webmaster-tools','webmaster-analysis','webmaster','site-analysis','site-analyzer','website-analysis'))
 AND tool_slug IS NOT NULL AND tool_slug<>'' AND (tool_url IS NULL OR tool_url='');
