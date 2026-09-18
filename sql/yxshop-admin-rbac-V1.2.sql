-- 宇星商城后台管理员与 RBAC 增量 V1.2
-- MySQL 8.x
-- 前置：已执行 yxshop-system-rbac-V1.sql
-- 用途：新增“管理员管理”菜单，并把现有商城管理员手机号纳入超级管理员角色。

SET NAMES utf8mb4;

INSERT INTO sys_menu
(id,parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
VALUES
(203,200,'system-admin-management','管理员管理','admin-management','管','menu',930,1,'active',NOW(),NOW())
ON DUPLICATE KEY UPDATE
parent_id=VALUES(parent_id),
menu_name=VALUES(menu_name),
component_key=VALUES(component_key),
icon=VALUES(icon),
menu_type=VALUES(menu_type),
sort_order=VALUES(sort_order),
visible=VALUES(visible),
status=VALUES(status),
updated_at=NOW();

INSERT IGNORE INTO sys_role_menu (role_id,menu_id)
SELECT id,203 FROM sys_role WHERE role_code='super_admin';

INSERT INTO sys_admin_user
(username,display_name,password_hash,status,created_at,updated_at)
VALUES
('13564802098','管理员','','active',NOW(),NOW())
ON DUPLICATE KEY UPDATE
display_name=VALUES(display_name),
status='active',
updated_at=NOW();

INSERT IGNORE INTO sys_admin_user_role (admin_user_id,role_id)
SELECT a.id,r.id
FROM sys_admin_user a
JOIN sys_role r ON r.role_code='super_admin'
WHERE a.username='13564802098';

SELECT 'yxshop-admin-rbac-V1.2 initialized' AS result;
