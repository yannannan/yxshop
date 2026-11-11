-- 在应用 MySQL 8.x 库由管理员执行，可重复执行；保留既有产品、排序、积分与用户记录。
CREATE TABLE IF NOT EXISTS tool_entry_settings (
 tool_slug VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 sort_order INT NOT NULL DEFAULT 0,enabled TINYINT NOT NULL DEFAULT 1,updated_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(tool_slug),KEY idx_tool_entry_sort(sort_order,tool_slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- 按现有产品顺序为入口预留间隔，手印始终复用文件签名产品，不新增重复计费产品。
INSERT IGNORE INTO tool_entry_settings(tool_slug,sort_order,enabled,updated_at)
SELECT tool_slug,(ROW_NUMBER() OVER (ORDER BY sort_order,id)-1)*10,1,DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%dT%H:%i:%s.000Z')
FROM products WHERE product_type='tool' AND tool_slug IS NOT NULL AND tool_slug<>'handprint-maker';
INSERT IGNORE INTO tool_entry_settings(tool_slug,sort_order,enabled,updated_at)
SELECT 'handprint-maker',s.sort_order+1,1,DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%dT%H:%i:%s.000Z')
FROM tool_entry_settings s WHERE s.tool_slug='document-signature';
CREATE TABLE IF NOT EXISTS tool_activity_events (
 id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 tool_slug VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 module_key VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '',
 event_type VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 user_id BIGINT NULL,session_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 created_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(id),KEY idx_tool_activity_time(created_at,tool_slug,event_type),KEY idx_tool_activity_module(tool_slug,module_key,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
