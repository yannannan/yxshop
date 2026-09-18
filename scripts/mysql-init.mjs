import mysql from 'mysql2/promise';

const config = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'yxshop',
  charset: 'utf8mb4_general_ci',
};

for (const key of ['host', 'user', 'password', 'database']) {
  if (!config[key]) throw new Error(`缺少 MySQL 配置：MYSQL_${key.toUpperCase()}`);
}

const tables = [
  `CREATE TABLE IF NOT EXISTS users (id BIGINT NOT NULL AUTO_INCREMENT, phone VARCHAR(64) NOT NULL, email VARCHAR(255) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'active', created_at VARCHAR(40) NOT NULL, PRIMARY KEY (id), UNIQUE KEY uq_users_phone (phone)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS categories (id BIGINT NOT NULL AUTO_INCREMENT, parent_id BIGINT NULL, name VARCHAR(255) NOT NULL, sort INT NOT NULL DEFAULT 0, status VARCHAR(32) NOT NULL DEFAULT 'active', created_at VARCHAR(40) NOT NULL, PRIMARY KEY (id), KEY idx_categories_parent_id (parent_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS products (id BIGINT NOT NULL AUTO_INCREMENT, name VARCHAR(255) NOT NULL, category VARCHAR(255) NOT NULL, subcategory VARCHAR(255) NOT NULL DEFAULT '', price DECIMAL(12,2) NOT NULL, cost_price DECIMAL(12,2) NOT NULL DEFAULT 0, old_price DECIMAL(12,2) NOT NULL DEFAULT 0, billing_cycle VARCHAR(64) NOT NULL DEFAULT 'once', attributes_json LONGTEXT NOT NULL, description TEXT NOT NULL, detail LONGTEXT NOT NULL, tag VARCHAR(255) NOT NULL DEFAULT '', tone VARCHAR(64) NOT NULL DEFAULT 'dark', initial VARCHAR(64) NOT NULL DEFAULT '', cover_image TEXT NOT NULL, detail_image TEXT NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'active', stock INT NOT NULL DEFAULT 0, sort_order INT NOT NULL DEFAULT 0, updated_at VARCHAR(40) NULL, PRIMARY KEY (id), KEY idx_products_sort_order (sort_order)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS orders (id VARCHAR(96) NOT NULL, user_id BIGINT NOT NULL, product_id BIGINT NOT NULL, credential_id BIGINT NULL, amount DECIMAL(12,2) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'pending', delivery_content LONGTEXT NOT NULL, recharge_json LONGTEXT NOT NULL, created_at VARCHAR(40) NOT NULL, delivered_at VARCHAR(40) NULL, updated_at VARCHAR(40) NULL, PRIMARY KEY (id), KEY idx_orders_user_id (user_id), KEY idx_orders_status (status), KEY idx_orders_credential_id (credential_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS credentials (id BIGINT NOT NULL AUTO_INCREMENT, product_id BIGINT NOT NULL, content LONGTEXT NOT NULL, account VARCHAR(255) NOT NULL DEFAULT '', password TEXT NOT NULL, email_auth_code TEXT NOT NULL, verification_url TEXT NOT NULL, cost_price DECIMAL(12,2) NOT NULL DEFAULT 0, sale_price DECIMAL(12,2) NOT NULL DEFAULT 0, status VARCHAR(32) NOT NULL DEFAULT 'available', PRIMARY KEY (id), KEY idx_credentials_product_status (product_id,status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS credential_assignments (id BIGINT NOT NULL AUTO_INCREMENT, credential_id BIGINT NOT NULL, order_id VARCHAR(96) NOT NULL, user_id BIGINT NOT NULL, product_name VARCHAR(255) NOT NULL DEFAULT '', category VARCHAR(255) NOT NULL DEFAULT '', subcategory VARCHAR(255) NOT NULL DEFAULT '', billing_cycle VARCHAR(64) NOT NULL DEFAULT 'once', status VARCHAR(32) NOT NULL DEFAULT 'active', assigned_at VARCHAR(40) NOT NULL, released_at VARCHAR(40) NULL, PRIMARY KEY (id), KEY idx_credential_assignments_credential (credential_id,status), KEY idx_credential_assignments_order (order_id,status)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS payment_qrs (id BIGINT NOT NULL AUTO_INCREMENT, product_id BIGINT NULL, name VARCHAR(255) NOT NULL, type VARCHAR(64) NOT NULL, amount DECIMAL(12,2) NOT NULL DEFAULT 0, image_url MEDIUMTEXT NULL, status VARCHAR(32) NOT NULL DEFAULT 'active', PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS notification_settings (type VARCHAR(64) NOT NULL, recipient_emails TEXT NOT NULL, enabled TINYINT NOT NULL DEFAULT 1, updated_at VARCHAR(40) NULL, PRIMARY KEY (type)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS order_notifications (id BIGINT NOT NULL AUTO_INCREMENT, order_id VARCHAR(96) NOT NULL, type VARCHAR(64) NOT NULL, recipient_email VARCHAR(255) NOT NULL, status VARCHAR(32) NOT NULL DEFAULT 'pending', error_message TEXT NOT NULL, created_at VARCHAR(40) NOT NULL, sent_at VARCHAR(40) NULL, PRIMARY KEY (id), UNIQUE KEY uq_order_notifications (order_id,type,recipient_email), KEY idx_order_notifications_order (order_id,type)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
  `CREATE TABLE IF NOT EXISTS email_config (id TINYINT NOT NULL, provider VARCHAR(32) NOT NULL DEFAULT 'smtp', from_address VARCHAR(255) NOT NULL DEFAULT '', smtp_host VARCHAR(255) NOT NULL DEFAULT '', smtp_port INT NOT NULL DEFAULT 465, smtp_security VARCHAR(32) NOT NULL DEFAULT 'tls', smtp_username VARCHAR(255) NOT NULL DEFAULT '', smtp_password TEXT NOT NULL, imap_host VARCHAR(255) NOT NULL DEFAULT '', imap_port INT NOT NULL DEFAULT 993, imap_security VARCHAR(32) NOT NULL DEFAULT 'tls', imap_username VARCHAR(255) NOT NULL DEFAULT '', imap_password TEXT NOT NULL, updated_at VARCHAR(40) NULL, PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
];

const pool = mysql.createPool(config);
try {
  for (const statement of tables) await pool.query(statement);
  // 兼容首次导入前已由旧脚本创建的 TEXT 字段。
  await pool.query('ALTER TABLE payment_qrs MODIFY image_url MEDIUMTEXT NULL');
  console.log(`MySQL 初始化完成：${config.host}:${config.port}/${config.database}`);
} finally {
  await pool.end();
}
