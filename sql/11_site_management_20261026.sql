-- 先执行10号SQL，再在当前应用MySQL库执行本文件。可重复执行；不删除站点、报告、积分或订单。
-- 既有站点默认待验证，安装各自脚本并验证后才可提交新的分析任务。
CREATE TABLE IF NOT EXISTS site_analysis_integrations (
 site_id VARCHAR(36) NOT NULL, user_id BIGINT NOT NULL, script_token CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 verified_at VARCHAR(40) NOT NULL DEFAULT '', last_seen_at VARCHAR(40) NOT NULL DEFAULT '',
 verify_requested_at VARCHAR(40) NOT NULL DEFAULT '', deleted_at VARCHAR(40) NOT NULL DEFAULT '',
 created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(site_id), UNIQUE KEY uq_site_script(script_token), KEY idx_site_integration_owner(user_id,deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS site_analysis_visits (
 site_id VARCHAR(36) NOT NULL, event_id VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 session_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 channel VARCHAR(20) NOT NULL, page_path VARCHAR(1024) NOT NULL,
 country_code VARCHAR(2) NOT NULL DEFAULT '', created_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(site_id,event_id), KEY idx_site_visits_period(site_id,created_at),
 KEY idx_site_visit_sessions(site_id,session_key,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- 删除站点采用 integrations.deleted_at 标记；不对任何历史表执行DELETE或级联删除。
