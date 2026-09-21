-- 宇星商城客户地址管理 + 技术服务订单地址快照 V1.4
-- MySQL 8.x
-- 在已执行 yxshop-onsite-service-V1.sql 的数据库上执行。

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  contact_name VARCHAR(50) NOT NULL,
  contact_phone VARCHAR(32) NOT NULL,
  province VARCHAR(50) NOT NULL DEFAULT '',
  city VARCHAR(50) NOT NULL DEFAULT '',
  district VARCHAR(80) NOT NULL DEFAULT '',
  detail_address VARCHAR(300) NOT NULL DEFAULT '',
  is_default TINYINT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_customer_address_user (user_id),
  KEY idx_customer_address_default (user_id,is_default),
  KEY idx_customer_address_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET @has_address_id = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'technical_service_orders' AND COLUMN_NAME = 'address_id'
);
SET @sql_address_id = IF(
  @has_address_id = 0,
  'ALTER TABLE technical_service_orders ADD COLUMN address_id BIGINT NULL AFTER service_address, ADD KEY idx_technical_order_address (address_id)',
  'SELECT 1'
);
PREPARE stmt_address_id FROM @sql_address_id;
EXECUTE stmt_address_id;
DEALLOCATE PREPARE stmt_address_id;

SET @has_address_snapshot = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'technical_service_orders' AND COLUMN_NAME = 'address_snapshot_json'
);
SET @sql_address_snapshot = IF(
  @has_address_snapshot = 0,
  'ALTER TABLE technical_service_orders ADD COLUMN address_snapshot_json LONGTEXT NULL AFTER address_id',
  'SELECT 1'
);
PREPARE stmt_address_snapshot FROM @sql_address_snapshot;
EXECUTE stmt_address_snapshot;
DEALLOCATE PREPARE stmt_address_snapshot;

SELECT 'yxshop-customer-address-V1.4 initialized' AS result;
