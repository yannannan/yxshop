-- 宇星商城 技术人员工作台 / 服务验收评价增量脚本 V1.5
-- MySQL 8.x
-- 依赖：yxshop-onsite-service-V1.sql、yxshop-user-permission-V1.3.sql、yxshop-customer-address-V1.4.sql
SET NAMES utf8mb4;

SET @db := DATABASE();

-- 技术人员账号绑定
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='technical_providers' AND COLUMN_NAME='user_id'),
  'SELECT 1',
  'ALTER TABLE technical_providers ADD COLUMN user_id BIGINT NULL AFTER id, ADD UNIQUE KEY uk_technical_provider_user (user_id)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 技术人员完成、客户验收时间
SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='technical_service_orders' AND COLUMN_NAME='provider_completed_at'),
  'SELECT 1',
  'ALTER TABLE technical_service_orders ADD COLUMN provider_completed_at VARCHAR(40) NULL AFTER completed_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='technical_service_orders' AND COLUMN_NAME='customer_accepted_at'),
  'SELECT 1',
  'ALTER TABLE technical_service_orders ADD COLUMN customer_accepted_at VARCHAR(40) NULL AFTER provider_completed_at'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS technical_service_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  order_id VARCHAR(64) NOT NULL,
  provider_id BIGINT NOT NULL,
  operator_user_id BIGINT NULL,
  log_type VARCHAR(30) NOT NULL DEFAULT 'note',
  content VARCHAR(2000) NOT NULL DEFAULT '',
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_technical_service_log_order (order_id),
  KEY idx_technical_service_log_provider (provider_id),
  KEY idx_technical_service_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS technical_service_reviews (
  id BIGINT NOT NULL AUTO_INCREMENT,
  order_id VARCHAR(64) NOT NULL,
  service_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  rating TINYINT NOT NULL,
  content VARCHAR(2000) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_technical_review_order (order_id),
  KEY idx_technical_review_provider (provider_id),
  KEY idx_technical_review_service (service_id),
  KEY idx_technical_review_user (user_id),
  KEY idx_technical_review_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 管理端增加“服务评价”菜单（已存在则跳过）
INSERT INTO sys_menu
(parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
SELECT id,'onsite-service-reviews','服务评价','service-reviews','评','menu',170,1,'active',NOW(),NOW()
FROM sys_menu
WHERE menu_code='onsite-services'
  AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='onsite-service-reviews');

-- 10003 = 技术人员。这里只补充说明数据，不覆盖既有用户权限。
-- 技术人员账号由管理端“技术人员 -> 登录手机号”绑定时自动写为 10003 / 技术人员。

SELECT 'yxshop-technician-workbench-V1.5 initialized' AS result;
