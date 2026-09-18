-- 宇星商城后台系统设置 / RBAC 初始化脚本 V1
-- 适用数据库：MySQL 8.x
-- 用途：数据库驱动菜单、父子菜单、角色、角色菜单权限、后台管理员角色关系
-- 执行前请确认已切换到 yxshop 数据库。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS sys_menu (
  id BIGINT NOT NULL AUTO_INCREMENT,
  parent_id BIGINT NULL,
  menu_code VARCHAR(64) NOT NULL,
  menu_name VARCHAR(50) NOT NULL,
  component_key VARCHAR(64) NOT NULL DEFAULT '',
  icon VARCHAR(20) NOT NULL DEFAULT '',
  menu_type VARCHAR(20) NOT NULL DEFAULT 'menu',
  sort_order INT NOT NULL DEFAULT 0,
  visible TINYINT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_menu_code (menu_code),
  KEY idx_sys_menu_parent (parent_id),
  KEY idx_sys_menu_sort (sort_order),
  KEY idx_sys_menu_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sys_role (
  id BIGINT NOT NULL AUTO_INCREMENT,
  role_code VARCHAR(64) NOT NULL,
  role_name VARCHAR(50) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_role_code (role_code),
  KEY idx_sys_role_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sys_role_menu (
  role_id BIGINT NOT NULL,
  menu_id BIGINT NOT NULL,
  PRIMARY KEY (role_id, menu_id),
  KEY idx_sys_role_menu_menu (menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sys_admin_user (
  id BIGINT NOT NULL AUTO_INCREMENT,
  username VARCHAR(64) NOT NULL,
  display_name VARCHAR(50) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_sys_admin_user_username (username),
  KEY idx_sys_admin_user_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS sys_admin_user_role (
  admin_user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (admin_user_id, role_id),
  KEY idx_sys_admin_user_role_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 一级菜单：保留当前商城后台原有模块
INSERT INTO sys_menu
(id,parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
VALUES
(1,NULL,'products','商品管理','products','◇','menu',10,1,'active',NOW(),NOW()),
(2,NULL,'categories','分类管理','categories','▤','menu',20,1,'active',NOW(),NOW()),
(3,NULL,'orders','订单管理','orders','▣','menu',30,1,'active',NOW(),NOW()),
(4,NULL,'users','用户管理','users','◎','menu',40,1,'active',NOW(),NOW()),
(5,NULL,'credentials','账号 / 卡密','credentials','⌘','menu',50,1,'active',NOW(),NOW()),
(6,NULL,'notifications','订单通知','notifications','✉','menu',60,1,'active',NOW(),NOW()),
(100,NULL,'onsite-services','上门服务','','⌖','directory',100,1,'active',NOW(),NOW()),
(200,NULL,'system-settings','系统设置','','⚙','directory',900,1,'active',NOW(),NOW())
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

-- 上门服务二级菜单
INSERT INTO sys_menu
(id,parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
VALUES
(101,100,'onsite-service-management','服务管理','service-management','服','menu',110,1,'active',NOW(),NOW()),
(102,100,'onsite-provider-management','技术人员','provider-management','人','menu',120,1,'active',NOW(),NOW()),
(103,100,'onsite-service-orders','服务订单','service-orders','单','menu',130,1,'active',NOW(),NOW()),
(104,100,'onsite-appointments','预约管理','service-appointments','约','menu',140,1,'active',NOW(),NOW()),
(105,100,'onsite-consultations','在线咨询','service-consultations','聊','menu',150,1,'active',NOW(),NOW()),
(106,100,'onsite-provider-applications','入驻审核','provider-applications','审','menu',160,1,'active',NOW(),NOW())
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

-- 系统设置二级菜单
INSERT INTO sys_menu
(id,parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at)
VALUES
(201,200,'system-menu-management','菜单管理','menu-management','菜','menu',910,1,'active',NOW(),NOW()),
(202,200,'system-role-management','角色管理','role-management','角','menu',920,1,'active',NOW(),NOW())
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

-- 初始化角色
INSERT INTO sys_role
(id,role_code,role_name,description,status,created_at,updated_at)
VALUES
(1,'super_admin','超级管理员','拥有商城后台全部菜单权限','active',NOW(),NOW()),
(2,'onsite_operator','上门服务运营','负责技术人员、技术服务、服务订单、预约、咨询及入驻审核','active',NOW(),NOW())
ON DUPLICATE KEY UPDATE
role_name=VALUES(role_name),
description=VALUES(description),
status=VALUES(status),
updated_at=NOW();

-- 超级管理员拥有全部菜单
INSERT IGNORE INTO sys_role_menu (role_id,menu_id)
SELECT 1,id FROM sys_menu;

-- 上门服务运营拥有上门服务父菜单及全部子菜单
INSERT IGNORE INTO sys_role_menu (role_id,menu_id)
SELECT 2,id FROM sys_menu WHERE id=100 OR parent_id=100;

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'yxshop-system-rbac-V1 initialized' AS result;
