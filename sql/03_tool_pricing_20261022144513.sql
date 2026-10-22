-- 工具套餐价格、支付核验时间、可用次数及成功处理扣次记录。MySQL 8.x，可重复执行。
-- 在 02_tool_services_20261022132147.sql 之后执行。保留现有工具、订单与二维码。
SET NAMES utf8mb4;
SET @db := DATABASE();
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='tool_plans_json'), 'SELECT 1', 'ALTER TABLE products ADD COLUMN tool_plans_json LONGTEXT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='tool_billing_cycle'), 'SELECT 1', 'ALTER TABLE orders ADD COLUMN tool_billing_cycle VARCHAR(20) NOT NULL DEFAULT ''''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='tool_paid_at'), 'SELECT 1', 'ALTER TABLE orders ADD COLUMN tool_paid_at VARCHAR(40) NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='tool_uses_remaining'), 'SELECT 1', 'ALTER TABLE orders ADD COLUMN tool_uses_remaining INT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE TABLE IF NOT EXISTS tool_usage_events (
  operation_id VARCHAR(128) NOT NULL,
  order_id VARCHAR(96) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (operation_id), KEY idx_tool_usage_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

START TRANSACTION;
-- 原有收费工具继续保留其价格，不为用户假定新的包月/包年价格。
UPDATE products SET tool_plans_json=JSON_ARRAY(JSON_OBJECT('cycle',billing_cycle,'price',price))
WHERE product_type='tool' AND tool_charge_type='paid' AND price>0 AND tool_plans_json IS NULL;
-- 此前工具购买采用一次性开放入口，历史订单保留原权益，不能随新套餐改变。
UPDATE orders o JOIN products p ON p.id=o.product_id
SET o.tool_billing_cycle='once'
WHERE p.product_type='tool' AND o.tool_billing_cycle='';
COMMIT;
