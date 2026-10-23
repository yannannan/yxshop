-- 链接视频解析、异步提取和重复下载，MySQL 8.x，可重复执行。
-- 前置：02 / 03 / 06 / 07 工具与积分迁移。不修改现有收费方式、价格或会员权益。
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS video_extraction_previews (
  id VARCHAR(36) NOT NULL, user_id BIGINT NOT NULL, product_id BIGINT NOT NULL,
  source_url TEXT NOT NULL, metadata_json MEDIUMTEXT NOT NULL,
  created_at VARCHAR(40) NOT NULL, expires_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id), KEY idx_video_preview_user (user_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS video_extraction_tasks (
  id VARCHAR(36) NOT NULL, user_id BIGINT NOT NULL, product_id BIGINT NOT NULL,
  request_hash CHAR(64) NOT NULL, title VARCHAR(500) NOT NULL,
  format_label VARCHAR(160) NOT NULL, format_json MEDIUMTEXT NOT NULL,
  billing_mode VARCHAR(20) NOT NULL, points_cost INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'queued', progress INT NOT NULL DEFAULT 0,
  file_extension VARCHAR(10) NOT NULL, file_size BIGINT NOT NULL DEFAULT 0,
  charged TINYINT NOT NULL DEFAULT 0, points_spent INT NOT NULL DEFAULT 0,
  billing_order_id VARCHAR(96) NOT NULL DEFAULT '', error_message VARCHAR(500) NOT NULL DEFAULT '',
  created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL, expires_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id), KEY idx_video_task_user (user_id,created_at), KEY idx_video_task_expiry (expires_at),
  KEY idx_video_task_status (status,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
UPDATE products SET tool_url='/tools/video-extractor.html'
WHERE tool_slug='video-extractor' AND product_type='tool' AND (tool_url IS NULL OR tool_url='');
