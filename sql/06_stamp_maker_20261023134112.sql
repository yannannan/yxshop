-- 印章制作成品、请求幂等及重复下载。MySQL 8.x，可重复执行。
-- 前置：商城及 02 / 03 工具套餐迁移。保留现有工具价格、收费模式和订单。
SET NAMES utf8mb4;
SET @db := DATABASE();
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='tool_plan_key'), 'SELECT 1', 'ALTER TABLE orders ADD COLUMN tool_plan_key VARCHAR(80) NOT NULL DEFAULT ''''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='tool_plan_name'), 'SELECT 1', 'ALTER TABLE orders ADD COLUMN tool_plan_name VARCHAR(120) NOT NULL DEFAULT ''''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE TABLE IF NOT EXISTS tool_generation_results (
  id VARCHAR(36) NOT NULL,
  user_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  order_id VARCHAR(96) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  image_base64 MEDIUMTEXT NOT NULL,
  image_size INT NOT NULL,
  charged TINYINT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_tool_generation_user (user_id,product_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- 仅补齐内置工具的空入口；不更改收费方式、价格、上架状态或已配置的外部链接。
UPDATE products SET tool_url='/tools/stamp-maker.html' WHERE tool_slug='stamp-maker' AND product_type='tool' AND (tool_url IS NULL OR tool_url='');
