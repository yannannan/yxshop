-- 宇星商城技术上门服务支付扩展 V1.1
-- MySQL 8.x
-- 前置：已执行 yxshop-admin-onsite-V1.sql
-- 新增技术服务微信/支付宝收款二维码配置表。

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS technical_payment_qrs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  service_id BIGINT NOT NULL,
  name VARCHAR(80) NOT NULL DEFAULT '',
  type VARCHAR(20) NOT NULL,
  image_url LONGTEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_technical_payment_qr_service_type (service_id,type),
  KEY idx_technical_payment_qr_service (service_id),
  KEY idx_technical_payment_qr_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SELECT 'yxshop-onsite-payment-V1.1 initialized' AS result;
