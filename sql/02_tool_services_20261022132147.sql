-- 工具服务独立管理、入口页面及四项初始数据。MySQL 8.x，可重复执行。
-- 在现有商城 / RBAC 数据库上执行；保留已有商品、上传图片和入口配置。
SET NAMES utf8mb4;
SET @db := DATABASE();

SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='product_type'), 'SELECT 1', 'ALTER TABLE products ADD COLUMN product_type VARCHAR(20) NOT NULL DEFAULT ''digital''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='tool_slug'), 'SELECT 1', 'ALTER TABLE products ADD COLUMN tool_slug VARCHAR(120) NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='tool_url'), 'SELECT 1', 'ALTER TABLE products ADD COLUMN tool_url TEXT NULL');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='tool_charge_type'), 'SELECT 1', 'ALTER TABLE products ADD COLUMN tool_charge_type VARCHAR(20) NOT NULL DEFAULT ''pending''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='seo_title'), 'SELECT 1', 'ALTER TABLE products ADD COLUMN seo_title VARCHAR(255) NOT NULL DEFAULT ''''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND COLUMN_NAME='seo_description'), 'SELECT 1', 'ALTER TABLE products ADD COLUMN seo_description VARCHAR(1000) NOT NULL DEFAULT ''''');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @ddl := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='products' AND INDEX_NAME='uq_products_tool_slug'), 'SELECT 1', 'ALTER TABLE products ADD UNIQUE KEY uq_products_tool_slug (tool_slug)');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

START TRANSACTION;

INSERT INTO categories (parent_id,name,sort,status,created_at)
SELECT NULL,'工具服务',20,'active',NOW()
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE parent_id IS NULL AND name='工具服务');

-- 已在“工具服务”及其下级添加的商品转入独立模块，内容与图片不变。
UPDATE products p
LEFT JOIN categories c ON c.name=p.category
LEFT JOIN categories parent ON parent.id=c.parent_id
SET p.product_type='tool'
WHERE p.product_type='digital' AND (p.category='工具服务' OR parent.name='工具服务');

-- 优先接续现有同名记录；仅为尚无页面标识的首条同名数据初始化。
UPDATE products SET tool_slug='c-drive-cleaner',tool_charge_type='free',price=0,status='active'
WHERE product_type='tool' AND name='免费C盘清理工具(100%释放)' AND tool_slug IS NULL ORDER BY id LIMIT 1;
UPDATE products SET tool_slug='video-extractor',status='active'
WHERE product_type='tool' AND name='链接视频提取工具' AND tool_slug IS NULL ORDER BY id LIMIT 1;
UPDATE products SET tool_slug='document-signature',status='active'
WHERE product_type='tool' AND name='文件在线签名' AND tool_slug IS NULL ORDER BY id LIMIT 1;
UPDATE products SET tool_slug='stamp-maker',status='active'
WHERE product_type='tool' AND name='印章在线制作' AND tool_slug IS NULL ORDER BY id LIMIT 1;

UPDATE products SET tool_slug=CONCAT('tool-',id)
WHERE product_type='tool' AND (tool_slug IS NULL OR tool_slug='');

SET @last_sort := (SELECT COALESCE(MAX(sort_order),0) FROM products);
INSERT INTO products
(name,category,subcategory,price,cost_price,old_price,billing_cycle,attributes_json,description,detail,tag,tone,initial,cover_image,detail_image,status,stock,sort_order,updated_at,product_type,tool_slug,tool_url,tool_charge_type,seo_title,seo_description)
SELECT seed.name,'工具服务','',0,0,0,'once','[]',seed.description,seed.detail,'工具','blue','',seed.logo,'','active',99999,@last_sort+seed.seed_order,NOW(),'tool',seed.slug,'',seed.charge_type,'',''
FROM (
  SELECT 1 AS seed_order,'免费C盘清理工具(100%释放)' AS name,'c-drive-cleaner' AS slug,'free' AS charge_type,'/tool-logos/c-drive-cleaner.svg' AS logo,
    '面向 Windows 系统盘清理的实用工具入口。' AS description,'了解 C 盘清理工具的用途与使用方式。工具入口配置完成后，可从本页免费进入。' AS detail
  UNION ALL SELECT 2,'链接视频提取工具','video-extractor','pending','/tool-logos/video-extractor.svg','通过视频链接查找视频提取工具入口。','集中查看链接视频提取工具的功能说明与使用方式。实际入口和收费方式由后台配置。'
  UNION ALL SELECT 3,'文件在线签名','document-signature','pending','/tool-logos/document-signature.svg','查找文件签名工具，简化日常文件处理。','查看文件在线签名工具的介绍与使用入口。支持范围及操作方式以后续工具页面说明为准。'
  UNION ALL SELECT 4,'印章在线制作','stamp-maker','pending','/tool-logos/stamp-maker.svg','在线印章图形制作的工具入口。','查看印章图形制作工具介绍。实际工具入口与收费方式可在后台单独配置。'
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.tool_slug=seed.slug);

-- 已有同名工具仅补齐空缺介绍与 Logo，不覆盖用户维护的内容。
UPDATE products SET cover_image='/tool-logos/c-drive-cleaner.svg' WHERE tool_slug='c-drive-cleaner' AND (cover_image='' OR cover_image IS NULL);
UPDATE products SET cover_image='/tool-logos/video-extractor.svg' WHERE tool_slug='video-extractor' AND (cover_image='' OR cover_image IS NULL);
UPDATE products SET cover_image='/tool-logos/document-signature.svg' WHERE tool_slug='document-signature' AND (cover_image='' OR cover_image IS NULL);
UPDATE products SET cover_image='/tool-logos/stamp-maker.svg' WHERE tool_slug='stamp-maker' AND (cover_image='' OR cover_image IS NULL);
UPDATE products SET description='面向 Windows 系统盘清理的实用工具入口。' WHERE tool_slug='c-drive-cleaner' AND description='';

INSERT INTO sys_menu (parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
SELECT NULL,'tools','工具服务','tools','工','menu',15,1,'active',NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='tools');

INSERT IGNORE INTO sys_role_menu (role_id,menu_id)
SELECT r.id,m.id FROM sys_role r JOIN sys_menu m ON m.menu_code='tools' WHERE r.role_code='super_admin';

COMMIT;

-- 核对：SELECT id,name,product_type,tool_slug,tool_charge_type,price,status FROM products WHERE product_type='tool';
-- 四项入口暂留空；请在“工具服务”模块编辑，实际收费规则尚未提供的三项默认“待确认”。
