-- 宇星商城后台系统设置 + 技术上门服务 一次性初始化脚本 V1
-- MySQL 8.x
-- 建议在 yxshop 数据库中执行。

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


-- ============================================================
-- 技术上门服务模块
-- ============================================================

-- 宇星商城「技术上门服务」数据库初始化脚本 V1
-- MySQL 8.x
-- 包含：技术人员、技术服务、服务订单、预约、在线咨询、联系方式申请、技术人才入驻
-- 可重复执行；现有 3 名技术人员与 9 项服务会按固定主键/唯一编码更新。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS technical_providers (
  id BIGINT NOT NULL AUTO_INCREMENT,
  provider_code VARCHAR(64) NOT NULL,
  name VARCHAR(50) NOT NULL,
  initials VARCHAR(8) NOT NULL DEFAULT '',
  avatar VARCHAR(500) NOT NULL DEFAULT '',
  city VARCHAR(80) NOT NULL DEFAULT '',
  experience VARCHAR(80) NOT NULL DEFAULT '',
  role_name VARCHAR(120) NOT NULL DEFAULT '',
  intro TEXT NULL,
  skills_json LONGTEXT NULL,
  certification_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  online_status VARCHAR(20) NOT NULL DEFAULT 'offline',
  sort_order INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_technical_provider_code (provider_code),
  KEY idx_technical_provider_status (status),
  KEY idx_technical_provider_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS technical_services (
  id BIGINT NOT NULL AUTO_INCREMENT,
  provider_id BIGINT NOT NULL,
  slug VARCHAR(100) NOT NULL,
  homepage_featured TINYINT NOT NULL DEFAULT 0,
  title VARCHAR(120) NOT NULL,
  summary VARCHAR(500) NOT NULL DEFAULT '',
  delivery_modes_json LONGTEXT NULL,
  coverage VARCHAR(200) NOT NULL DEFAULT '',
  pricing_mode VARCHAR(20) NOT NULL DEFAULT 'fixed',
  price DECIMAL(10,2) NULL,
  unit VARCHAR(20) NOT NULL DEFAULT '次',
  online_response VARCHAR(80) NOT NULL DEFAULT '',
  onsite_arrival VARCHAR(80) NOT NULL DEFAULT '',
  service_includes_json LONGTEXT NULL,
  delivery_notes_json LONGTEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'inactive',
  sort_order INT NOT NULL DEFAULT 0,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_technical_service_slug (slug),
  KEY idx_technical_service_provider (provider_id),
  KEY idx_technical_service_status (status),
  KEY idx_technical_service_homepage (homepage_featured),
  KEY idx_technical_service_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS technical_service_orders (
  id VARCHAR(64) NOT NULL,
  service_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  customer_phone VARCHAR(32) NOT NULL DEFAULT '',
  customer_email VARCHAR(120) NOT NULL DEFAULT '',
  delivery_mode VARCHAR(20) NOT NULL,
  pricing_mode VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NULL,
  requirement_text TEXT NULL,
  service_address VARCHAR(500) NOT NULL DEFAULT '',
  scheduled_at VARCHAR(40) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  paid_at VARCHAR(40) NULL,
  accepted_at VARCHAR(40) NULL,
  started_at VARCHAR(40) NULL,
  completed_at VARCHAR(40) NULL,
  PRIMARY KEY (id),
  KEY idx_technical_order_service (service_id),
  KEY idx_technical_order_provider (provider_id),
  KEY idx_technical_order_user (user_id),
  KEY idx_technical_order_status (status),
  KEY idx_technical_order_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS technical_service_appointments (
  id BIGINT NOT NULL AUTO_INCREMENT,
  order_id VARCHAR(64) NOT NULL,
  service_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  delivery_mode VARCHAR(20) NOT NULL,
  scheduled_at VARCHAR(40) NOT NULL,
  service_address VARCHAR(500) NOT NULL DEFAULT '',
  contact_name VARCHAR(50) NOT NULL DEFAULT '',
  contact_phone VARCHAR(32) NOT NULL DEFAULT '',
  note VARCHAR(1000) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_technical_appointment_order (order_id),
  KEY idx_technical_appointment_provider (provider_id),
  KEY idx_technical_appointment_time (scheduled_at),
  KEY idx_technical_appointment_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS technical_consultations (
  id BIGINT NOT NULL AUTO_INCREMENT,
  service_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  customer_phone VARCHAR(32) NOT NULL DEFAULT '',
  customer_email VARCHAR(120) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  last_message_at VARCHAR(40) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_technical_consultation_service (service_id),
  KEY idx_technical_consultation_provider (provider_id),
  KEY idx_technical_consultation_user (user_id),
  KEY idx_technical_consultation_status (status),
  KEY idx_technical_consultation_last (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS technical_consultation_messages (
  id BIGINT NOT NULL AUTO_INCREMENT,
  consultation_id BIGINT NOT NULL,
  sender_type VARCHAR(20) NOT NULL,
  sender_id BIGINT NULL,
  content TEXT NOT NULL,
  read_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_technical_message_consultation (consultation_id),
  KEY idx_technical_message_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS technical_contact_requests (
  id BIGINT NOT NULL AUTO_INCREMENT,
  consultation_id BIGINT NOT NULL,
  service_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requested_at VARCHAR(40) NOT NULL,
  reviewed_at VARCHAR(40) NULL,
  reviewed_by BIGINT NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  KEY idx_technical_contact_consultation (consultation_id),
  KEY idx_technical_contact_provider (provider_id),
  KEY idx_technical_contact_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS technical_provider_applications (
  id BIGINT NOT NULL AUTO_INCREMENT,
  applicant_name VARCHAR(50) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(120) NOT NULL DEFAULT '',
  city VARCHAR(80) NOT NULL DEFAULT '',
  experience VARCHAR(80) NOT NULL DEFAULT '',
  role_name VARCHAR(120) NOT NULL DEFAULT '',
  intro TEXT NULL,
  skills_json LONGTEXT NULL,
  credential_urls_json LONGTEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  review_note VARCHAR(1000) NOT NULL DEFAULT '',
  reviewed_by BIGINT NULL,
  reviewed_at VARCHAR(40) NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_technical_application_phone (phone),
  KEY idx_technical_application_status (status),
  KEY idx_technical_application_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 现有技术人员
INSERT INTO technical_providers
(id,provider_code,name,initials,avatar,city,experience,role_name,intro,skills_json,certification_status,online_status,sort_order,status,created_at,updated_at)
VALUES
(1,'provider-zhangwei','张伟','张','/technical-services/provider-zhangwei-v1.png','北京','8年经验','AI 部署与网站技术服务专家','专注 AI 网站部署、服务器环境搭建与上线交付，提供从配置到稳定运行的完整技术支持。','["网站运维","服务器","Linux","企业 IT","系统部署","故障排查"]','verified','online',10,'active',NOW(),NOW()),
(2,'provider-lina','李娜','李','/technical-services/provider-lina-v1.png','上海','6年经验','企业 AI 系统定制顾问','聚焦企业 AI 工具落地、流程自动化与系统集成，先梳理业务需求，再确认可执行的服务方案。','["Java 开发","Python","Web 应用","系统集成","AI 工具","流程自动化"]','verified','online',20,'active',NOW(),NOW()),
(3,'provider-wangqiang','王强','王','/technical-services/provider-wangqiang-v1.png','深圳','10年经验','服务器运维与安全工程师','提供服务器巡检、故障排查和安全加固服务，帮助业务系统保持稳定、可持续运行。','["安防监控","门禁系统","弱电工程","智能硬件","服务器","安全加固"]','verified','online',30,'active',NOW(),NOW())
ON DUPLICATE KEY UPDATE
provider_code=VALUES(provider_code),name=VALUES(name),initials=VALUES(initials),avatar=VALUES(avatar),city=VALUES(city),experience=VALUES(experience),role_name=VALUES(role_name),intro=VALUES(intro),skills_json=VALUES(skills_json),certification_status=VALUES(certification_status),online_status=VALUES(online_status),sort_order=VALUES(sort_order),status=VALUES(status),updated_at=NOW();

-- 现有 9 项技术服务
INSERT INTO technical_services
(id,provider_id,slug,homepage_featured,title,summary,delivery_modes_json,coverage,pricing_mode,price,unit,online_response,onsite_arrival,service_includes_json,delivery_notes_json,status,sort_order,created_at,updated_at)
VALUES
(1,1,'ai-site-deployment',1,'AI网站部署与技术搭建','覆盖环境部署、域名配置、系统上线与后续技术支持。','["online","onsite"]','全市服务','fixed',500.00,'次','1–5 分钟响应','20分钟到场','[{"title":"服务器环境部署","detail":"配置运行环境与必要组件，保障系统稳定运行。"},{"title":"域名配置与解析","detail":"协助域名绑定、DNS 解析及 SSL 证书配置。"},{"title":"网站程序部署","detail":"完成程序、数据库配置与功能调试优化。"},{"title":"AI 应用集成","detail":"对接主流 AI 能力，完成模型部署与应用配置。"},{"title":"系统测试与优化","detail":"进行功能测试、性能优化及安全检查。"},{"title":"上线支持与培训","detail":"协助正式上线，并提供基础操作指引。"}]','["需求确认后开始实施","过程同步与阶段验收","交付说明与后续答疑"]','active',10,NOW(),NOW()),
(2,2,'ai-system-customization',1,'企业 AI 系统定制与实施','适用于企业内部工具、流程自动化和 AI 应用落地。','["online","onsite"]','区域服务 · 上海、苏州、杭州','negotiable',NULL,'次','1–5 分钟响应','20分钟到场','[{"title":"业务需求梳理","detail":"明确使用场景、目标与实施边界。"},{"title":"AI 方案设计","detail":"输出可落地的系统与流程建议。"},{"title":"系统定制实施","detail":"按确认范围进行配置、开发与联调。"},{"title":"上线验收支持","detail":"配合测试、验收与使用交接。"}]','["先免费沟通需求","确认方案与服务价格","安排实施与验收交付"]','active',20,NOW(),NOW()),
(3,3,'server-operation-security',1,'服务器运维与安全加固','系统巡检、故障排查、安全防护与稳定性优化。','["online"]','','fixed',600.00,'次','1–5 分钟响应','','[{"title":"服务器健康巡检","detail":"检查系统、进程、资源与关键告警。"},{"title":"故障排查处理","detail":"定位异常原因并给出可执行处理建议。"},{"title":"安全基线加固","detail":"优化账户、访问策略与基础安全配置。"},{"title":"稳定性优化","detail":"针对瓶颈提出性能与可用性改善方案。"}]','["说明服务器与问题现状","在线沟通后开始处理","确认处理结果与后续建议"]','active',30,NOW(),NOW()),
(4,1,'enterprise-server-environment',0,'企业服务器环境部署','Linux / Windows 服务器部署、环境配置与基础稳定性优化。','["online","onsite"]','全市服务','fixed',500.00,'次','1–5 分钟响应','20分钟到场','[{"title":"运行环境配置","detail":"完成系统、运行时与基础组件配置。"},{"title":"部署与联调","detail":"完成服务部署、启动验证与基础联调。"},{"title":"稳定性检查","detail":"检查关键资源、权限与运行状态。"}]','["确认服务器与目标环境","执行部署并同步进度","完成验证与交付说明"]','active',40,NOW(),NOW()),
(5,1,'enterprise-network-repair',0,'企业网络故障排查与修复','无法上网、网络波动与访问异常的快速排查和修复支持。','["online","onsite"]','全市服务','fixed',300.00,'小时','1–5 分钟响应','20分钟到场','[{"title":"异常定位","detail":"分析网络连通性、访问链路与异常日志。"},{"title":"修复建议","detail":"给出可执行的修复方案并协助处理。"},{"title":"结果确认","detail":"完成连通性验证并说明后续注意事项。"}]','["说明网络异常现象","选择沟通或上门服务","确认修复结果"]','active',50,NOW(),NOW()),
(6,2,'ai-process-automation',0,'企业 AI 流程自动化实施','梳理重复业务流程，完成 AI 工具与自动化流程的落地实施。','["online","onsite"]','区域服务 · 上海、苏州、杭州','negotiable',NULL,'次','1–5 分钟响应','20分钟到场','[{"title":"流程梳理","detail":"明确重复工作、触发条件与执行边界。"},{"title":"自动化方案","detail":"设计可执行的 AI 工具与自动化方案。"},{"title":"上线支持","detail":"完成测试、交接与使用说明。"}]','["在线沟通需求","确认方案与价格","安排实施与验收"]','active',60,NOW(),NOW()),
(7,2,'ai-application-integration',0,'AI 应用集成与系统联调','连接业务系统、AI 能力与数据流程，支持上线前后的联调优化。','["online","onsite"]','区域服务 · 上海、苏州、杭州','negotiable',NULL,'次','1–5 分钟响应','20分钟到场','[{"title":"接口与能力对接","detail":"梳理系统接口、AI 能力与数据流转方式。"},{"title":"联调与验证","detail":"完成关键流程联调及异常处理验证。"},{"title":"上线优化","detail":"根据使用反馈优化配置与调用流程。"}]','["确认集成范围","沟通方案与服务价格","执行联调并完成验收"]','active',70,NOW(),NOW()),
(8,3,'server-health-inspection',0,'服务器健康巡检与故障处理','针对资源、日志、进程与告警进行系统巡检和故障处理。','["online"]','','fixed',300.00,'小时','1–5 分钟响应','','[{"title":"健康巡检","detail":"检查服务器资源、服务进程和关键告警。"},{"title":"故障处理","detail":"定位异常原因并协助恢复服务。"},{"title":"巡检报告","detail":"输出关键问题与后续处理建议。"}]','["说明服务器和问题现状","在线诊断并处理","确认结果与后续建议"]','active',80,NOW(),NOW()),
(9,3,'security-baseline-hardening',0,'企业安全基线加固','优化账户、访问策略与基础安全配置，降低常见运行风险。','["online"]','','fixed',800.00,'次','1–5 分钟响应','','[{"title":"账户与权限检查","detail":"检查高风险账户和访问权限配置。"},{"title":"基础安全加固","detail":"优化关键服务、访问策略与安全基线。"},{"title":"风险说明","detail":"说明已处理风险与后续维护建议。"}]','["说明安全需求与当前环境","在线执行检查与加固","确认处理结果"]','active',90,NOW(),NOW())
ON DUPLICATE KEY UPDATE
provider_id=VALUES(provider_id),homepage_featured=VALUES(homepage_featured),title=VALUES(title),summary=VALUES(summary),delivery_modes_json=VALUES(delivery_modes_json),coverage=VALUES(coverage),pricing_mode=VALUES(pricing_mode),price=VALUES(price),unit=VALUES(unit),online_response=VALUES(online_response),onsite_arrival=VALUES(onsite_arrival),service_includes_json=VALUES(service_includes_json),delivery_notes_json=VALUES(delivery_notes_json),status=VALUES(status),sort_order=VALUES(sort_order),updated_at=NOW();

SET FOREIGN_KEY_CHECKS = 1;

SELECT 'yxshop-onsite-service-V1 initialized' AS result;
