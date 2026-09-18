-- 宇星商城用户权限类型增量 V1.3
-- MySQL 8.x
-- 用户权限来源统一到 users 表：
-- 10001 = 普通用户
-- 10002 = 超级管理员（可访问管理平台）

SET NAMES utf8mb4;

SET @db_name = DATABASE();

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    "ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'",
    "SELECT 1"
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='users' AND COLUMN_NAME='status'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    "ALTER TABLE users ADD COLUMN permission_type VARCHAR(10) NOT NULL DEFAULT '10001'",
    "SELECT 1"
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='users' AND COLUMN_NAME='permission_type'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = (
  SELECT IF(
    COUNT(*) = 0,
    "ALTER TABLE users ADD COLUMN permission_type_name VARCHAR(30) NOT NULL DEFAULT '普通用户'",
    "SELECT 1"
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='users' AND COLUMN_NAME='permission_type_name'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE users
SET permission_type='10001', permission_type_name='普通用户'
WHERE permission_type IS NULL OR permission_type='' OR permission_type NOT IN ('10001','10002');

UPDATE users
SET permission_type_name=CASE permission_type
  WHEN '10002' THEN '超级管理员'
  ELSE '普通用户'
END;

-- 保留当前既有管理员为超级管理员；后续是否能进后台只判断 permission_type，不再按手机号写死。
UPDATE users
SET permission_type='10002', permission_type_name='超级管理员'
WHERE phone='13564802098';

SET @idx_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=@db_name AND TABLE_NAME='users' AND INDEX_NAME='idx_users_permission_type'
);
SET @sql = IF(@idx_exists=0, "CREATE INDEX idx_users_permission_type ON users(permission_type)", "SELECT 1");
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT id,phone,status,permission_type,permission_type_name
FROM users
ORDER BY id DESC;
