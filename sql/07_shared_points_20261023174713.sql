-- 通用积分、每用户一次性赠送 100、四档充值套餐。MySQL 8.x，可重复执行。
-- 前置：02/03 工具套餐及 06 印章迁移。执行前备份；不切换任何现有工具收费模式。
SET NAMES utf8mb4;
SET @db := DATABASE();
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='tool_points_cost'),'SELECT 1','ALTER TABLE products ADD COLUMN tool_points_cost INT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='points_amount'),'SELECT 1','ALTER TABLE products ADD COLUMN points_amount INT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='orders' AND COLUMN_NAME='points_amount'),'SELECT 1','ALTER TABLE orders ADD COLUMN points_amount INT NOT NULL DEFAULT 0');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
CREATE TABLE IF NOT EXISTS points_wallets (
  user_id BIGINT NOT NULL, balance BIGINT NOT NULL DEFAULT 100,
  created_at VARCHAR(40) NOT NULL, updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS points_ledger (
  operation_id VARCHAR(128) NOT NULL, user_id BIGINT NOT NULL, kind VARCHAR(32) NOT NULL,
  delta INT NOT NULL, balance_after BIGINT NOT NULL, product_id BIGINT NULL, order_id VARCHAR(96) NULL,
  created_at VARCHAR(40) NOT NULL, PRIMARY KEY(operation_id),
  KEY idx_points_user(user_id,created_at), KEY idx_points_order(order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
START TRANSACTION;
INSERT IGNORE INTO points_wallets(user_id,balance,created_at,updated_at)
SELECT id,100,NOW(),NOW() FROM users;
INSERT IGNORE INTO points_ledger(operation_id,user_id,kind,delta,balance_after,product_id,order_id,created_at)
SELECT CONCAT('welcome:',user_id),user_id,'welcome',100,100,NULL,NULL,created_at FROM points_wallets;
-- 套餐标识固定；重复执行不覆盖管理员已改的名称、价格、数量和状态。
INSERT INTO products(name,category,subcategory,price,old_price,cost_price,billing_cycle,attributes_json,description,detail,cover_image,detail_image,tag,tone,initial,status,stock,sort_order,product_type,tool_slug,points_amount,updated_at)
SELECT '轻享积分包','积分充值','',20,0,0,'once','[]','到账 200 通用积分，各工具按配置消耗。','', '', '', '积分','blue','', 'active',99999,10001,'points','wallet-pack-200',200,NOW()
WHERE NOT EXISTS(SELECT 1 FROM products WHERE tool_slug='wallet-pack-200');
INSERT INTO products(name,category,subcategory,price,old_price,cost_price,billing_cycle,attributes_json,description,detail,cover_image,detail_image,tag,tone,initial,status,stock,sort_order,product_type,tool_slug,points_amount,updated_at)
SELECT '常用积分包','积分充值','',50,0,0,'once','[]','到账 600 通用积分，各工具按配置消耗。','', '', '', '积分','blue','', 'active',99999,10002,'points','wallet-pack-600',600,NOW()
WHERE NOT EXISTS(SELECT 1 FROM products WHERE tool_slug='wallet-pack-600');
INSERT INTO products(name,category,subcategory,price,old_price,cost_price,billing_cycle,attributes_json,description,detail,cover_image,detail_image,tag,tone,initial,status,stock,sort_order,product_type,tool_slug,points_amount,updated_at)
SELECT '畅用积分包','积分充值','',100,0,0,'once','[]','到账 1200 通用积分，各工具按配置消耗。','', '', '', '积分','blue','', 'active',99999,10003,'points','wallet-pack-1200',1200,NOW()
WHERE NOT EXISTS(SELECT 1 FROM products WHERE tool_slug='wallet-pack-1200');
INSERT INTO products(name,category,subcategory,price,old_price,cost_price,billing_cycle,attributes_json,description,detail,cover_image,detail_image,tag,tone,initial,status,stock,sort_order,product_type,tool_slug,points_amount,updated_at)
SELECT '尊享积分包','积分充值','',200,0,0,'once','[]','到账 2500 通用积分，各工具按配置消耗。','', '', '', '积分','blue','', 'active',99999,10004,'points','wallet-pack-2500',2500,NOW()
WHERE NOT EXISTS(SELECT 1 FROM products WHERE tool_slug='wallet-pack-2500');
INSERT INTO payment_qrs(product_id,name,type,amount,image_url,status)
SELECT p.id,CONCAT(m.type,' ',p.price),m.type,p.price,NULL,'inactive' FROM products p
JOIN (SELECT 'wechat' AS type UNION ALL SELECT 'alipay') m
WHERE p.product_type='points' AND NOT EXISTS(SELECT 1 FROM payment_qrs q WHERE q.product_id=p.id AND q.type=m.type AND q.amount=p.price);
INSERT INTO sys_menu(parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
SELECT NULL,'points','积分管理','points','积','menu',13,1,'active',NOW(),NOW()
WHERE NOT EXISTS(SELECT 1 FROM sys_menu WHERE menu_code='points');
INSERT IGNORE INTO sys_role_menu(role_id,menu_id)
SELECT r.id,m.id FROM sys_role r JOIN sys_menu m ON m.menu_code='points' WHERE r.role_code='super_admin';
COMMIT;
