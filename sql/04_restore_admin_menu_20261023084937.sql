-- 补齐“系统设置 -> 管理员管理”菜单及超级管理员菜单关联。
-- MySQL 8.x；前置：已初始化 RBAC 数据表。
-- 可重复执行；按 menu_code 查找，不使用固定菜单 ID。
-- 现有数据库 ID 203 已被“服务评价”占用，不能直接重跑旧 V1.2 的固定 ID 插入。
-- 本脚本不修改现有菜单、用户权限或管理员账号与角色归属。
SET NAMES utf8mb4;

START TRANSACTION;

INSERT INTO sys_menu
(parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
SELECT NULL,'system-settings','系统设置','','⚙','directory',900,1,'active',NOW(),NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='system-settings');

INSERT INTO sys_menu
(parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
SELECT p.id,'system-admin-management','管理员管理','admin-management','管','menu',930,1,'active',NOW(),NOW()
FROM sys_menu p
WHERE p.menu_code='system-settings'
  AND NOT EXISTS (SELECT 1 FROM sys_menu WHERE menu_code='system-admin-management');

INSERT IGNORE INTO sys_role_menu (role_id,menu_id)
SELECT r.id,m.id
FROM sys_role r
JOIN sys_menu m ON m.menu_code='system-admin-management'
WHERE r.role_code='super_admin';

COMMIT;

-- 执行后确认：管理员管理和服务评价应为两个不同菜单，服务评价保持原样。
SELECT m.id,m.menu_code,m.menu_name,p.menu_name AS parent_name,m.component_key,m.status
FROM sys_menu m
LEFT JOIN sys_menu p ON p.id=m.parent_id
WHERE m.menu_code IN ('system-admin-management','onsite-service-reviews')
ORDER BY m.menu_code;
