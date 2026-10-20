-- yxshop V1.6：三级菜单分类结构初始化
-- 目标：首页一级菜单统一为：账号服务 / 工具服务 / 验证码服务
-- 说明：categories 表已经使用 parent_id 表达父子关系，本次不新增字段，仅调整分类数据层级。
-- 可重复执行：INSERT 使用 NOT EXISTS；UPDATE 仅调整指定旧分类。

START TRANSACTION;

INSERT INTO categories (parent_id, name, sort, status, created_at)
SELECT NULL, '账号服务', 10, 'active', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '账号服务'
);

INSERT INTO categories (parent_id, name, sort, status, created_at)
SELECT NULL, '工具服务', 20, 'active', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '工具服务'
);

INSERT INTO categories (parent_id, name, sort, status, created_at)
SELECT NULL, '验证码服务', 30, 'active', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM categories WHERE parent_id IS NULL AND name = '验证码服务'
);

SET @account_service_id := (
  SELECT id FROM categories
  WHERE parent_id IS NULL AND name = '账号服务'
  ORDER BY id
  LIMIT 1
);

SET @verification_service_id := (
  SELECT id FROM categories
  WHERE parent_id IS NULL AND name = '验证码服务'
  ORDER BY id
  LIMIT 1
);

-- 原一级分类整体下沉为“账号服务”的二级分类；
-- 原二级分类因为 parent_id 不变，会自然成为三级分类。
UPDATE categories
SET parent_id = @account_service_id
WHERE parent_id IS NULL
  AND name IN ('会员充值', '会员充值服务', '会员租用', '会员拼车', '账号注册购买', '其他');

-- 验证码旧一级分类下沉为“验证码服务”的二级分类；
-- 国内验证码 / 国际验证码自然成为三级分类。
UPDATE categories
SET parent_id = @verification_service_id
WHERE parent_id IS NULL
  AND name IN ('验证码接收服务');

COMMIT;

-- 执行后建议核对：
-- SELECT c1.name AS level1, c2.name AS level2, c3.name AS level3
-- FROM categories c1
-- LEFT JOIN categories c2 ON c2.parent_id = c1.id
-- LEFT JOIN categories c3 ON c3.parent_id = c2.id
-- WHERE c1.parent_id IS NULL
-- ORDER BY c1.sort, c2.sort, c3.sort;
