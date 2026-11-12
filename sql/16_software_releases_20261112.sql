-- 前置02号工具服务增量SQL。MySQL 8.x，可重复执行，不覆盖现有产品、积分与发布内容。
CREATE TABLE IF NOT EXISTS tool_software_pages (
 product_id BIGINT NOT NULL,content_json LONGTEXT NOT NULL,updated_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS tool_software_releases (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,product_id BIGINT NOT NULL,
 version VARCHAR(48) NOT NULL,supported_systems VARCHAR(200) NOT NULL,release_notes TEXT NOT NULL,
 status VARCHAR(12) NOT NULL DEFAULT 'draft',file_name VARCHAR(160) NOT NULL DEFAULT '',
 file_size BIGINT NOT NULL DEFAULT 0,sha256 CHAR(64) NOT NULL DEFAULT '',object_json TEXT NOT NULL,
 upload_token VARCHAR(36) NOT NULL DEFAULT '',upload_started_at VARCHAR(40) NOT NULL DEFAULT '',
 created_by BIGINT NOT NULL,created_at VARCHAR(40) NOT NULL,updated_at VARCHAR(40) NOT NULL,
 published_at VARCHAR(40) NOT NULL DEFAULT '',download_requests BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY(id),UNIQUE KEY uk_software_version(product_id,version),KEY idx_software_product(product_id,status,published_at),KEY idx_software_created(product_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
