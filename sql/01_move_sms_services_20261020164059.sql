-- yxshop：将 106 短信服务移动到“验证码服务”
-- 文件命名规范：编号_功能英文名称_yyyyMMddHHmmss.sql
-- 本 SQL 可重复执行；仅调整 categories.parent_id，不新增表或字段。

START TRANSACTION;

SET @verification_service_id := (
  SELECT id
  FROM categories
  WHERE parent_id IS NULL
    AND name = '验证码服务'
  ORDER BY id
  LIMIT 1
);

SET @old_sms_parent_id := (
  SELECT id
  FROM categories
  WHERE name = '106短信通道服务'
  ORDER BY id
  LIMIT 1
);

-- 将两个二级分类直接移动到“验证码服务”下。
UPDATE categories
SET parent_id = @verification_service_id
WHERE name IN ('106短信在线发送', '106短信API接口服务')
  AND (
    parent_id = @old_sms_parent_id
    OR parent_id <> @verification_service_id
    OR parent_id IS NULL
  );

COMMIT;

-- 执行后核对：
-- SELECT c.id, c.name, c.parent_id, p.name AS parent_name
-- FROM categories c
-- LEFT JOIN categories p ON p.id = c.parent_id
-- WHERE c.name IN ('106短信在线发送', '106短信API接口服务');
