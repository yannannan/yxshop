-- 前置：02 / 03 / 06 / 07 号增量SQL。在应用MySQL库由管理员执行，可重复执行。
-- 不删除或覆盖任何用户、积分、订单及既有工具配置。
CREATE TABLE IF NOT EXISTS tool_module_points (
 product_id BIGINT NOT NULL,module_key VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 points_cost INT NOT NULL,updated_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(product_id,module_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TABLE IF NOT EXISTS image_processing_results (
 id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,user_id BIGINT NOT NULL,product_id BIGINT NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,action VARCHAR(20) NOT NULL,
 image_base64 MEDIUMTEXT NOT NULL,image_width INT NOT NULL,image_height INT NOT NULL,image_format VARCHAR(8) NOT NULL,
 image_bytes INT NOT NULL,points_spent INT NOT NULL DEFAULT 0,created_at VARCHAR(40) NOT NULL,
 PRIMARY KEY(id),KEY idx_image_owner(user_id,product_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
-- 新工具默认10积分/成功任务，可在管理端改为免费或分别配置各功能积分。
INSERT INTO products (name,description,detail,cover_image,price,tool_slug,tool_url,tool_charge_type,tool_points_cost,tool_plans_json,billing_cycle,seo_title,seo_description,status,updated_at,category,subcategory,product_type,old_price,cost_price,attributes_json,detail_image,tag,tone,initial,stock,sort_order)
SELECT '图片在线处理','去水印、图像拼接、压缩与基础图像编辑，在线预览并下载处理结果。','支持手动框选修补、横向/纵向/网格拼接、JPG压缩、锐化、基础降噪、纯色背景抠图和框选文字覆盖。成功生成才扣积分，同一结果重复下载不扣积分。','/tool-logos/image-processor.svg',0,'image-processor','/tools/image-processor.html','points',10,'[]','once','图片在线处理｜宇星脉通','图片去水印、拼接、压缩与基础编辑，处理后预览下载。','active',DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-%dT%H:%i:%s.000Z'),'工具服务','','tool',0,0,'[]','','工具','orange','',99999,COALESCE((SELECT MAX(sort_order)+1 FROM products p),1)
WHERE NOT EXISTS(SELECT 1 FROM products WHERE tool_slug='image-processor');
