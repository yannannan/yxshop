-- 首页展示方式、模块与条目排序。MySQL 8.x，可重复执行。
-- 前置：已有商城及 RBAC 数据表；不修改现有商品、分类、订单和已保存的首页配置。
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS homepage_display_settings (
  id TINYINT NOT NULL,
  config_json LONGTEXT NOT NULL,
  updated_at VARCHAR(40) NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

START TRANSACTION;
INSERT INTO homepage_display_settings (id,config_json,updated_at)
SELECT 1,'{"mode":"grouped","sectionOrder":["tools"],"itemOrder":[]}',NOW()
WHERE NOT EXISTS (SELECT 1 FROM homepage_display_settings WHERE id=1);
INSERT INTO sys_menu (parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
SELECT NULL,'homepage-display','首页展示','homepage-display','排','menu',12,1,'active',NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='homepage-display');
INSERT IGNORE INTO sys_role_menu (role_id,menu_id)
SELECT r.id,m.id FROM sys_role r JOIN sys_menu m ON m.menu_code='homepage-display' WHERE r.role_code='super_admin';
COMMIT;
