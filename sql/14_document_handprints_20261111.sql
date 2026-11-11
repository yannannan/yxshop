-- 前置13号文件签名增量SQL；可重复执行，不修改已有签名、印章、成品及积分价格。
CREATE TABLE IF NOT EXISTS document_handprints (
 user_id BIGINT NOT NULL,id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,product_id BIGINT NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,name VARCHAR(48) NOT NULL,
 png MEDIUMBLOB NULL,image_width INT NOT NULL,image_height INT NOT NULL,points_spent INT NOT NULL DEFAULT 0,
 created_at VARCHAR(40) NOT NULL,deleted_at VARCHAR(40) NULL,
 PRIMARY KEY(user_id,id),KEY idx_handprint_owner(user_id,deleted_at,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
