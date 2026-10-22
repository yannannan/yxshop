import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { matchesProductCategory } from '../lib/categories.ts';

const categories = [
  { name: '工具服务', children: [] },
  { name: '账号服务', children: [
    { name: '会员充值服务', children: [{ name: 'ChatGPT会员充值', children: [] }] },
    { name: '会员租用', children: [{ name: 'ChatGPT会员租用', children: [] }] },
  ] },
  { name: '验证码服务', children: [{ name: '106短信在线发送', children: [] }] },
];
const routeSource = ts.transpileModule(
  readFileSync(new URL('../app/api/admin/route.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// 隔离数据库、会话及邮件；调用真实 POST 路由，不连接业务数据库。
function adminRoute({ category, parent, linkedProducts = 0, children = 0 } = {}) {
  const writes = [];
  const paymentRecords = [];
  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.includes('COUNT(*)') && sql.includes('FROM products')) return { total: linkedProducts };
          if (sql.includes('COUNT(*)') && sql.includes('FROM categories')) return { total: children };
          if (sql.startsWith('SELECT c.')) return category || null;
          if (sql.startsWith('SELECT id,parent_id,name FROM categories')) return parent || null;
          return null;
        },
        async run() { writes.push({ sql, values }); return { meta: { last_row_id: 101 } }; },
      };
    },
  };
  const modules = {
    '@/db/mysql-runtime': { env: { DB } },
    '../../../db/setup': { ensureDatabase: async () => {}, ensurePaymentQrRecords: async (...args) => { paymentRecords.push(args); } },
    '../../../lib/order-notifications': {},
    '../../../lib/admin-auth': { getAdminContext: async () => ({ superAdmin: true }), hasAdminPermission: () => true },
  };
  const exports = {};
  vm.runInNewContext(routeSource, {
    exports, Response, console,
    require(name) { assert.ok(name in modules, `Unexpected import: ${name}`); return modules[name]; },
  });
  return {
    writes, paymentRecords,
    post(body) { return exports.POST(new Request('http://localhost/api/admin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })); },
  };
}

const cases = [
  { label: '没有下级分类的一级菜单', rootCategory: '工具服务', category: '', subcategory: '', storedCategory: '工具服务' },
  { label: '有下级分类但直接归属一级菜单', rootCategory: '账号服务', category: '', subcategory: '', storedCategory: '账号服务' },
  { label: '没有三级分类的二级分类', rootCategory: '验证码服务', category: '106短信在线发送', subcategory: '', storedCategory: '106短信在线发送' },
  { label: '有三级分类但仅选择二级', rootCategory: '账号服务', category: '会员充值服务', subcategory: '', storedCategory: '会员充值服务' },
  { label: '完整三级分类', rootCategory: '账号服务', category: '会员充值服务', subcategory: 'ChatGPT会员充值', storedCategory: '会员充值服务' },
];

for (const entry of cases) {
  for (const edit of [false, true]) {
    test(`${edit ? '编辑' : '新增'}商品：${entry.label}，保存后按所属层级可检索`, async () => {
      const route = adminRoute();
      const response = await route.post({ action: 'product-save', ...entry, id: edit ? 101 : 0, name: '分类回归商品', price: '10' });
      assert.equal(response.status, 200);
      const saved = route.writes.find(({ sql }) => sql.startsWith(edit ? 'UPDATE products SET name=' : 'INSERT INTO products'));
      assert.ok(saved);
      assert.equal(saved.values[1], entry.storedCategory);
      assert.equal(saved.values[2], entry.subcategory);
      const product = { category: saved.values[1], subcategory: saved.values[2] };
      assert.equal(matchesProductCategory(product, categories, '全部商品'), true);
      assert.equal(matchesProductCategory(product, categories, entry.rootCategory), true);
      if (entry.category) assert.equal(matchesProductCategory(product, categories, entry.rootCategory, entry.category), true);
      if (entry.subcategory) assert.equal(matchesProductCategory(product, categories, entry.rootCategory, entry.category, entry.subcategory), true);
      const otherRoot = entry.rootCategory === '工具服务' ? '账号服务' : '工具服务';
      assert.equal(matchesProductCategory(product, categories, otherRoot), false);
      assert.equal(route.paymentRecords.length, 1);
      if (edit) assert.equal(saved.values.at(-1), 101);
    });
  }
}

test('一级、二级商品不会混入不属于自己的下级分类', () => {
  assert.equal(matchesProductCategory({ category: '账号服务', subcategory: '' }, categories, '账号服务', '会员充值服务'), false);
  assert.equal(matchesProductCategory({ category: '会员充值服务', subcategory: '' }, categories, '账号服务', '会员充值服务', 'ChatGPT会员充值'), false);
  assert.equal(matchesProductCategory({ category: '会员充值服务', subcategory: 'ChatGPT会员充值' }, categories, '账号服务', '会员租用'), false);
});

test('缺少名称或所有分类时仍拒绝保存，并返回可展示的错误', async () => {
  for (const body of [{ name: '', rootCategory: '工具服务' }, { name: '未分类商品' }]) {
    const route = adminRoute();
    const response = await route.post({ action: 'product-save', ...body });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).message);
    assert.equal(route.writes.length, 0);
  }
});

test('不能跳过二级直接保存三级分类', async () => {
  const route = adminRoute();
  const response = await route.post({ action: 'product-save', name: '错层商品', rootCategory: '账号服务', subcategory: 'ChatGPT会员充值' });
  assert.equal(response.status, 400);
  assert.equal(route.writes.length, 0);
});

test('重命名一级菜单同步更新直接归属它的商品', async () => {
  const route = adminRoute({ category: { id: 1, parent_id: null, grand_parent_id: null, name: '工具服务' } });
  assert.equal((await route.post({ action: 'category-save', id: 1, name: '在线工具', status: 'active' })).status, 200);
  const update = route.writes.find(({ sql }) => sql.startsWith('UPDATE products SET category='));
  assert.ok(update);
  assert.equal(update.values[0], '在线工具');
  assert.equal(update.values.at(-1), '工具服务');
});

test('直接关联商品的一级菜单禁止删除', async () => {
  const route = adminRoute({ category: { id: 1, parent_id: null, name: '工具服务' }, linkedProducts: 1 });
  assert.equal((await route.post({ action: 'category-delete', id: 1 })).status, 400);
  assert.equal(route.writes.length, 0);
});

test('直接关联商品的一级菜单禁止直接变更层级', async () => {
  const route = adminRoute({
    category: { id: 1, parent_id: null, grand_parent_id: null, name: '工具服务' },
    parent: { id: 2, parent_id: null, name: '账号服务' }, linkedProducts: 1,
  });
  assert.equal((await route.post({ action: 'category-save', id: 1, name: '工具服务', parentId: 2 })).status, 400);
  assert.equal(route.writes.length, 0);
});
