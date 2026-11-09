-- 前置为02、03、06、07号增量SQL。可重复执行，保留已有工具定价与用户记录。
CREATE TABLE IF NOT EXISTS tool_module_points (
 product_id BIGINT NOT NULL,module_key VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 points_cost INT NOT NULL,updated_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(product_id,module_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS document_signatures (
 user_id BIGINT NOT NULL,id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,product_id BIGINT NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,name VARCHAR(48) NOT NULL,
 png MEDIUMBLOB NULL,image_width INT NOT NULL,image_height INT NOT NULL,points_spent INT NOT NULL DEFAULT 0,
 created_at VARCHAR(40) NOT NULL,deleted_at VARCHAR(40) NULL,
 PRIMARY KEY(user_id,id),KEY idx_signature_owner(user_id,deleted_at,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS signed_documents (
 user_id BIGINT NOT NULL,id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,product_id BIGINT NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,file_name VARCHAR(160) NOT NULL,
 file_bytes INT NOT NULL,points_spent INT NOT NULL DEFAULT 0,created_at VARCHAR(40) NOT NULL,
 expires_at VARCHAR(40) NOT NULL,storage_json TEXT NOT NULL,
 PRIMARY KEY(user_id,id),KEY idx_signed_document_owner(user_id,product_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET @signature_now := DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%dT%H:%i:%s.000Z');
SET @signature_sort := (SELECT COALESCE(MAX(sort_order),0)+1 FROM products);
SET @signature_description := '制作手写签名，在 PDF、DOCX 或图片上定位签名并下载成品。';
SET @signature_detail := '签名保存在个人签名库，支持跨页放置、拖动和调整大小。保存签名与生成签署文件分别计费，同一成品重复下载不扣积分。';
INSERT INTO products (name,category,subcategory,price,cost_price,old_price,billing_cycle,attributes_json,
 description,detail,tag,tone,initial,cover_image,detail_image,status,stock,sort_order,updated_at,
 product_type,tool_slug,tool_url,tool_charge_type,tool_points_cost,tool_plans_json,seo_title,seo_description)
SELECT '文件在线签名','工具服务','',0,0,0,'once','[]',@signature_description,@signature_detail,
 '工具','blue','','/tool-logos/document-signature.svg','','active',99999,@signature_sort,@signature_now,
 'tool','document-signature','','pending',0,'[]','文件在线签名｜宇星脉通',@signature_description
WHERE NOT EXISTS (SELECT 1 FROM products WHERE tool_slug='document-signature');

START TRANSACTION;
INSERT INTO tool_module_points (product_id,module_key,points_cost,updated_at)
SELECT p.id,seed.module_key,seed.points_cost,@signature_now
FROM products p CROSS JOIN (SELECT 'create' AS module_key,10 AS points_cost UNION ALL SELECT 'sign',20) seed
WHERE p.product_type='tool' AND p.tool_slug='document-signature' AND p.tool_charge_type='pending'
 AND COALESCE(p.tool_url,'')=''
ON DUPLICATE KEY UPDATE updated_at=tool_module_points.updated_at;

UPDATE products SET tool_url='/tools/document-signature.html',tool_charge_type='points',
 tool_points_cost=CASE WHEN tool_points_cost>0 THEN tool_points_cost ELSE 10 END,updated_at=@signature_now
WHERE product_type='tool' AND tool_slug='document-signature' AND tool_charge_type='pending' AND COALESCE(tool_url,'')='';

UPDATE products SET description=@signature_description
WHERE product_type='tool' AND tool_slug='document-signature' AND (COALESCE(description,'')='' OR description='查找文件签名工具，简化日常文件处理。');
UPDATE products SET detail=@signature_detail
WHERE product_type='tool' AND tool_slug='document-signature' AND (COALESCE(detail,'')='' OR detail='查看文件在线签名工具的介绍与使用入口。支持范围及操作方式以后续工具页面说明为准。');
COMMIT;
