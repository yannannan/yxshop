-- 统一个人中心。仅新增独立资料表，不更改既有手机号、身份权限、积分、订单或地址。
-- MySQL 8.x；可重复执行。账户积分沿用 07，工具记录沿用 06 / 08。
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS yxshop_user_profiles (
  user_id BIGINT NOT NULL,
  nickname VARCHAR(128) NOT NULL DEFAULT '',
  avatar_data MEDIUMTEXT NOT NULL,
  avatar_mime VARCHAR(32) NOT NULL DEFAULT '',
  avatar_version VARCHAR(64) NOT NULL DEFAULT '',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
