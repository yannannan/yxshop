import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import jpeg from 'jpeg-js';
import { Resvg } from '@resvg/resvg-wasm';
import * as options from '../lib/stamp-options.ts';
import * as tools from '../lib/tool-services.ts';
import { renderStamp, stampSvg } from '../lib/stamp-renderer.ts';

const require = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Response, Request, URL, Buffer, crypto: webcrypto, console: { error() {} }, ...globals, require(name) { if (name in mocks) return mocks[name]; if (['react', 'react/jsx-runtime', 'node:crypto'].includes(name)) return require(name); throw new Error(`Unexpected module: ${name}`); } });
  return exports;
}
const pureEntitlements = load('../lib/tool-entitlements.ts', { '@/db/mysql-runtime': { env: {} }, './tool-services': tools });
const serviceBase = { '@/db/mysql-runtime': { env: {} }, '@/db/setup': { getVerifiedSessionPhone: () => null }, './tool-entitlements': pureEntitlements, './tool-services': tools, './stamp-options': options };
const { StampError } = load('../lib/stamp-service.ts', serviceBase);
const id = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222';
const stampTool = { id: 40, tool_charge_type: 'paid' };
const standard = options.defaultStampOptions();

test('四种样式参数可用；严格校验文字、颜色、尺寸、布尔值及危险输入', () => {
  for (const preset of options.stampPresets) assert.equal(options.parseStampOptions(preset.options).shape, preset.shape);
  for (const patch of [{ text: '' }, { text: '<script>' }, { text: '字'.repeat(33) }, { color: 'url(https://x)' }, { code: '../../file' }, { fontSize: Infinity }, { rotation: 90 }, { background: 'red' }, { size: 999999 }, { innerRing: 'true' }, { shape: 'name', text: '只有一个很长的名字' }, { symbol: 'image' }]) assert.throws(() => options.parseStampOptions({ ...standard, ...patch }));
  const normalized = options.parseStampOptions({ ...standard, text: ' 宇星工作室 ', color: '#AA2233', svg: '<image href="file:///secret" />' });
  assert.equal(normalized.text, '宇星工作室'); assert.equal(normalized.color, '#aa2233'); assert.equal('svg' in normalized, false);
});

test('真实 WebAssembly 中文渲染：各样式返回 PNG，预览固定 420，高清支持全部尺寸', async () => {
  for (const preset of options.stampPresets) {
    const png = await renderStamp(preset.options, true);
    assert.equal(png.subarray(1, 4).toString(), 'PNG'); assert.equal(png.readUInt32BE(16), 420); assert.equal(png.readUInt32BE(20), 420); assert.ok(png.length > 15000, '中文及图形应有实际像素内容');
  }
  for (const size of options.stampSizes) {
    const png = await renderStamp({ ...standard, size });
    assert.equal(png.readUInt32BE(16), size); assert.equal(png.readUInt32BE(20), size);
    assert.equal(cornerAlpha(png), 0, '透明导出应保留透明通道');
  }
  assert.equal(cornerAlpha(await renderStamp({ ...standard, size: 1024, background: 'white' })), 255, '白底导出应为不透明白色');
  const svg = stampSvg({ ...standard, text: 'A&B工作室' });
  assert.ok(svg.includes('&amp;')); assert.ok(!svg.includes('file:')); assert.ok(!svg.includes('效果预览'));
  assert.ok(stampSvg(standard, true).includes('效果预览'));
  assert.ok(stampSvg({ ...standard, background: 'white' }).includes('fill="white"'));
});

test('十档尺寸和三种格式受服务端白名单校验，旧参数默认 PNG，JPG 强制白底', () => {
  assert.equal(options.stampSizes.length, 10);
  assert.deepEqual([...options.stampSizes].sort((a, b) => a - b), options.stampSizes);
  for (const size of options.stampSizes) for (const format of Object.keys(options.stampFormats)) assert.equal(options.parseStampOptions({ ...standard, size, format }).format, format);
  for (const patch of [{ size: 128 }, { size: 500 }, { size: 8192 }, { size: '1024' }, { format: 'webp' }, { format: 'toString' }, { format: '<svg>' }, { format: null }]) assert.throws(() => options.parseStampOptions({ ...standard, ...patch }));
  const { format, ...legacy } = standard;
  assert.equal(format, 'png'); assert.deepEqual(options.parseStampOptions(legacy), standard);
  assert.equal(options.parseStampOptions({ ...standard, format: 'jpeg', background: 'transparent' }).background, 'white');
});

test('JPG 生成真实文件且背景为白色，支持最小与最大尺寸；预览仍固定 PNG', async () => {
  for (const size of [256, 4096]) {
    const encoded = await renderStamp({ ...standard, size, format: 'jpeg', background: 'transparent' });
    assert.equal(encoded.readUInt16BE(0), 0xffd8);
    const decoded = jpeg.decode(encoded, { useTArray: true });
    assert.equal(decoded.width, size); assert.equal(decoded.height, size);
    assert.ok([...decoded.data.slice(0, 3)].every(channel => channel >= 250), 'JPG 透明区域应合成为白底');
  }
  for (const format of ['jpeg', 'svg']) {
    const preview = await renderStamp({ ...standard, size: 4096, format }, true);
    assert.equal(preview.subarray(1, 4).toString(), 'PNG'); assert.equal(preview.readUInt32BE(16), 420);
  }
});

test('SVG 中文转为轮廓，不依赖字体；尺寸和透明或白底可在无字体条件下还原', async () => {
  for (const { value: font } of options.stampFonts) for (const background of ['transparent', 'white']) {
    const svg = (await renderStamp({ ...standard, font, background, format: 'svg', size: 4096 })).toString();
    assert.match(svg, /^<svg width="4096" height="4096"/);
    assert.ok(svg.includes('<path')); assert.ok(!svg.includes('<text')); assert.ok(!svg.includes('效果预览'));
    assert.ok(!/(?:href|src)="(?:https?:|file:)|<script/i.test(svg));
    const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: 256 } });
    try { const result = renderer.render(); try {
      assert.equal(result.pixels[3], background === 'white' ? 255 : 0);
      assert.ok(result.pixels.some((value, index) => index % 4 === 0 && value > 100), '无需字体也应有实际印章像素');
    } finally { result.free(); } } finally { renderer.free(); }
  }
});

test('旧请求自动使用宋体和原间距，未知字体、文件路径及越界间距被拒绝', () => {
  const { font, textInset, ...legacy } = standard;
  assert.deepEqual(options.parseStampOptions(legacy), standard);
  for (const patch of [{ font: null }, { font: 'missing' }, { font: '../../file.ttf' }, { textInset: null }, { textInset: -1 }, { textInset: 101 }, { textInset: Infinity }, { textInset: '12' }]) assert.throws(() => options.parseStampOptions({ ...standard, ...patch }));
  assert.equal(options.parseStampOptions({ ...standard, textInset: 0 }).textInset, 0);
  assert.equal(options.parseStampOptions({ ...standard, textInset: 100 }).textInset, 100);
  assert.equal(font, 'serif'); assert.equal(textInset, 12);
});

test('渲染模块热更新和并发加载复用同一 Wasm 实例，预览及成品继续可用', async () => {
  const [first, second] = await Promise.all([import('../lib/stamp-renderer.ts?hot=first'), import('../lib/stamp-renderer.ts?hot=second')]);
  const images = await Promise.all([first.renderStamp(standard, true), second.renderStamp({ ...standard, font: 'kai', size: 1024 }), renderStamp({ ...standard, font: 'sans' }, true)]);
  assert.deepEqual(images.map(image => image.readUInt32BE(16)), [420, 1024, 420]);
  assert.ok(images.every(image => image.subarray(1, 4).toString() === 'PNG'));
});

test('修复前已初始化的开发进程可直接恢复，不把热更新重复初始化误报为预览失败', async () => {
  const previous = globalThis.__yxshopStampWasm;
  delete globalThis.__yxshopStampWasm;
  try {
    const updated = await import('../lib/stamp-renderer.ts?hot=legacy-process');
    const png = await updated.renderStamp(standard, true);
    assert.equal(png.readUInt32BE(16), 420);
  } finally { globalThis.__yxshopStampWasm = previous; }
});

test('圆形与椭圆文字可独立向内移动，不改变边框、字号、弧度或辅助文字', () => {
  for (const shape of ['circle', 'ellipse']) {
    const sample = { ...standard, shape, text: '印', subtitle: '设计专用', code: '123', symbol: 'none' };
    const near = stampSvg({ ...sample, textInset: 0 }), far = stampSvg({ ...sample, textInset: 100 });
    const mainTextY = svg => Number(svg.match(/<text[^>]*transform="translate\(500\.00 ([\d.]+)\)/)[1]);
    assert.equal(mainTextY(far) - mainTextY(near), 100, '增大间距应把顶部文字移向圆心');
    assert.equal(near.match(/<ellipse[^>]*>/)[0], far.match(/<ellipse[^>]*>/)[0]);
    assert.equal(near.match(/<text[^>]*>设计专用<\/text>/)[0], far.match(/<text[^>]*>设计专用<\/text>/)[0]);
    assert.ok(near.includes('font-size="80.00"')); assert.ok(far.includes('font-size="80.00"'));
  }
});

test('三种真实中文字体在四种样式中均可生成不同的预览与高清像素', async () => {
  for (const preset of options.stampPresets) {
    const previews = [], exports = [];
    for (const { value: font } of options.stampFonts) {
      const sample = { ...preset.options, font, textInset: 35, size: 1024 };
      const preview = await renderStamp(sample, true), exported = await renderStamp(sample);
      assert.equal(preview.readUInt32BE(16), 420); assert.equal(exported.readUInt32BE(16), 1024);
      assert.equal(cornerAlpha(exported), 0);
      previews.push(preview.toString('base64')); exports.push(exported.toString('base64'));
    }
    assert.equal(new Set(previews).size, 3, `${preset.shape} 预览应实际使用不同字体`);
    assert.equal(new Set(exports).size, 3, `${preset.shape} 成品应实际使用不同字体`);
  }
  for (const shape of ['circle', 'ellipse']) {
    const sample = { ...standard, shape, symbol: 'none', subtitle: '', code: '', size: 1024 };
    assert.notDeepEqual(await renderStamp({ ...sample, textInset: 0 }), await renderStamp({ ...sample, textInset: 100 }));
  }
});

function cornerAlpha(png) {
  assert.equal(png[24], 8); assert.equal(png[25], 6);
  const data = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') data.push(png.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  // 第一行第一个像素没有左侧/上一行像素，所有 PNG 行过滤器的该像素原值相同。
  return inflateSync(Buffer.concat(data))[4];
}

function api({ charge = 'paid', user = { id: 1 }, entitled = true, previous = null, renderFails = false, saveFails = false, renderImage = Buffer.from('png') } = {}) {
  const calls = [];
  const service = {
    StampError,
    getStampTool: async () => ({ ...stampTool, tool_charge_type: charge }), stampUser: async () => user,
    findStampResult: async (...args) => { calls.push(['find', ...args]); return previous; },
    stampAccess: async () => ({ canGenerate: entitled, chargeType: charge }),
    savePaidStamp: async (...args) => { calls.push(['save', ...args]); if (saveFails) throw new Error('保存成品失败'); return { id: args[2], charged: true, image: 'data:image/png;base64,cG5n', reused: false }; },
  };
  const mocks = { '@/lib/stamp-options': options, '@/lib/stamp-service': service, '@/lib/stamp-renderer': { async renderStamp(...args) { calls.push(['render', ...args]); if (renderFails) throw new Error('渲染失败'); return renderImage; } } };
  const route = load('../app/api/tools/stamp-maker/route.ts', mocks);
  const preview = load('../app/api/tools/stamp-maker/preview/route.ts', mocks);
  return { calls, route, preview, generate: body => route.POST(new Request('http://localhost/api/tools/stamp-maker', { method: 'POST', body: JSON.stringify({ id, options: standard, ...body }) })) };
}
test('免费匿名制作不写扣次或成品库；成功返回高清图片', async () => {
  const setup = api({ charge: 'free', user: null });
  const response = await setup.generate();
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal((await response.json()).result.charged, false);
  assert.deepEqual(setup.calls.map(call => call[0]), ['render']);
});
test('待确认、未登录和未购买时拦截制作；拒绝前端伪造价格、身份及剩余次数', async () => {
  for (const [config, expected] of [[{ charge: 'pending' }, 409], [{ user: null }, 401], [{ entitled: false }, 402]]) {
    const setup = api(config), response = await setup.generate({ userId: 999, price: 0, remaining: 99, chargeType: 'free' });
    assert.equal(response.status, expected); assert.ok(!setup.calls.some(call => call[0] === 'render' || call[0] === 'save'));
  }
});
test('付费制作先完成渲染，再由服务端当前用户、工具、参数指纹完成保存', async () => {
  const setup = api(), response = await setup.generate({ userId: 999, productId: 999 });
  assert.equal(response.status, 200);
  assert.deepEqual(setup.calls.map(call => call[0]), ['find', 'render', 'save']);
  const saved = setup.calls.find(call => call[0] === 'save');
  assert.equal(saved[1], 1); assert.equal(saved[2], 40); assert.equal(saved[3], id); assert.match(saved[4], /^[a-f0-9]{64}$/);
});

test('API 返回实际文件的 MIME 和格式，格式参与任务指纹；付费保存原始文件字节', async () => {
  const hashes = [];
  for (const format of Object.keys(options.stampFormats)) {
    const selected = { ...standard, size: 512, format }, image = await renderStamp(selected);
    const response = await api({ charge: 'free', user: null, renderImage: image }).generate({ options: selected });
    assert.equal(response.status, 200);
    const result = (await response.json()).result;
    assert.equal(result.format, format); assert.ok(result.image.startsWith(`data:${options.stampFormats[format].mime};base64,`));
    assert.deepEqual(Buffer.from(result.image.split(',')[1], 'base64'), image);
    const paid = api({ renderImage: image });
    assert.equal((await paid.generate({ options: selected })).status, 200);
    const saved = paid.calls.find(call => call[0] === 'save');
    assert.deepEqual(saved[5], image); assert.equal(saved[6], 512); hashes.push(saved[4]);
  }
  assert.equal(new Set(hashes).size, 3);
});

test('PNG 兼容升级前的任务指纹，旧页面重试不会因新增格式参数被拒绝', async () => {
  const { format, ...legacy } = standard;
  assert.equal(format, 'png');
  const expected = createHash('sha256').update(JSON.stringify(legacy)).digest('hex');
  for (const selected of [standard, legacy]) {
    const setup = api(); assert.equal((await setup.generate({ options: selected })).status, 200);
    assert.equal(setup.calls.find(call => call[0] === 'save')[4], expected);
  }
});
test('预览与成品接收相同字体和间距，更改任一项会生成不同参数指纹', async () => {
  const hashes = [];
  for (const patch of [{}, { font: 'sans' }, { textInset: 65 }]) {
    const setup = api(), selected = { ...standard, ...patch };
    assert.equal((await setup.preview.POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(selected) }))).status, 200);
    assert.equal((await setup.generate({ options: selected })).status, 200);
    const renders = setup.calls.filter(call => call[0] === 'render');
    assert.deepEqual(renders[0][1], renders[1][1]);
    assert.equal(renders[1][1].font, selected.font); assert.equal(renders[1][1].textInset, selected.textInset);
    hashes.push(setup.calls.find(call => call[0] === 'save')[4]);
  }
  assert.equal(new Set(hashes).size, 3);
});
test('同一任务网络重试即使次数已耗尽，也返回先前成品，不重新渲染或扣次', async () => {
  const setup = api({ entitled: false, previous: { id, reused: true, image: 'data:image/png;base64,cG5n' } });
  const response = await setup.generate(); assert.equal(response.status, 200); assert.equal((await response.json()).result.reused, true);
  assert.deepEqual(setup.calls.map(call => call[0]), ['find']);
});
test('渲染失败不调用权益保存，损坏请求或参数被拒绝', async () => {
  const setup = api({ renderFails: true }); assert.equal((await setup.generate()).status, 503); assert.ok(!setup.calls.some(call => call[0] === 'save'));
  for (const body of [{ id: 'anything' }, { options: { ...standard, size: 99999 } }, { options: null }]) assert.equal((await api().generate(body)).status, 400);
  assert.equal((await api().route.POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status, 400);
  assert.equal((await api().route.POST(new Request('http://localhost', { method: 'POST', body: ' '.repeat(8193) }))).status, 413);
});
test('预览无论会员状态都不调用扣次，只产生受限大小的带水印图片', async () => {
  const setup = api({ charge: 'pending', user: null });
  const response = await setup.preview.POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(standard) }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual(setup.calls.map(call => call[0]), ['render']); assert.equal(setup.calls[0][2], true);
  assert.equal((await setup.preview.POST(new Request('http://localhost', { method: 'POST', body: '{' }))).status, 400);
});
test('成品下载必须登录并按当前用户和当前工具查询，GET 不扣次', async () => {
  const setup = api({ previous: { id, image: 'data:image/png;base64,cG5n' } });
  const response = await setup.route.GET(new Request(`http://localhost/api/tools/stamp-maker?result=${id}`));
  assert.equal(response.status, 200); assert.deepEqual(setup.calls[0], ['find', 1, 40, id]);
  assert.equal((await api({ user: null }).route.GET(new Request(`http://localhost?result=${id}`))).status, 401);
  assert.equal((await api().route.GET(new Request(`http://localhost?result=${id}`))).status, 404);
  assert.equal((await api().route.GET(new Request('http://localhost?result=../file'))).status, 404);
});

// 执行真实 MySQL 事务包装及印章服务，只替换底层连接；不连接业务数据库。
function ledger({ orders, fail = '', active = true, toolActive = true } = {}) {
  const state = { orders: orders || [{ id: 'order-1', user_id: 1, product_id: 40, status: 'paid', tool_billing_cycle: 'times', tool_uses_remaining: 1, tool_paid_at: null }], events: [], results: [] };
  const log = [];
  let queue = Promise.resolve();
  const query = async (sql, args, connection) => {
    log.push(sql);
    if (sql.includes('FROM users') && sql.includes('FOR UPDATE')) {
      const before = queue; queue = new Promise(resolve => { connection.unlock = resolve; });
      await before; connection.snapshot = structuredClone(state);
      return [active ? [{ id: args[0] }] : []];
    }
    if (sql.includes('FROM products')) return [toolActive ? [{ id: 40 }] : []];
    if (sql.includes('FROM orders')) return [state.orders.filter(order => order.user_id === args[0] && order.product_id === args[1] && ['paid', 'pending_delivery', 'delivered'].includes(order.status))];
    if (sql.includes('FROM tool_generation_results')) {
      if (sql.startsWith('SELECT id,image_size')) return [state.results.filter(row => row.user_id === args[0] && row.product_id === args[1]).map(row => ({ id: row.id, size: row.image_size, createdAt: row.created_at }))];
      return [state.results.filter(row => row.id === args[0] && (args.length === 1 || (row.user_id === args[1] && row.product_id === args[2])))];
    }
    if (sql.startsWith('UPDATE orders')) {
      const order = state.orders.find(order => order.id === args[0] && order.user_id === args[1] && order.tool_uses_remaining > 0);
      if (!order) return [{ affectedRows: 0 }]; order.tool_uses_remaining--; return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO tool_usage_events')) { if (fail === 'event') throw new Error('日志写入失败'); state.events.push({ id: args[0], order: args[1] }); return [{ affectedRows: 1 }]; }
    if (sql.startsWith('INSERT INTO tool_generation_results')) {
      if (fail === 'result') throw new Error('成品写入失败');
      state.results.push(Object.fromEntries(['id', 'user_id', 'product_id', 'order_id', 'request_hash', 'image_base64', 'image_size', 'charged', 'created_at'].map((key, index) => [key, args[index]]))); return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const runtime = load('../db/mysql-runtime.ts', { 'mysql2/promise': { createPool: () => ({ execute: (sql, args) => query(sql, args), async getConnection() {
    const connection = {
      async beginTransaction() { log.push('BEGIN'); }, execute: (sql, args) => query(sql, args, connection),
      async commit() { log.push('COMMIT'); connection.unlock?.(); },
      async rollback() { if (connection.snapshot) Object.assign(state, connection.snapshot); log.push('ROLLBACK'); connection.unlock?.(); }, release() {},
    }; return connection;
  } }) } }, { process: { env: { MYSQL_HOST: 'mock', MYSQL_USER: 'mock', MYSQL_PASSWORD: 'mock', MYSQL_DATABASE: 'mock' } } });
  const service = load('../lib/stamp-service.ts', { ...serviceBase, '@/db/mysql-runtime': runtime });
  return { service, state, log, save: (key = id, hash = 'a'.repeat(64), user = 1) => service.savePaidStamp(user, 40, key, hash, Buffer.from('png'), 1600) };
}
test('最后一次权益并发制作两个不同任务：只有一个成功，另一个不产生免费成品', async () => {
  const setup = ledger();
  const results = await Promise.allSettled([setup.save(id), setup.save(otherId)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 402);
  assert.equal(setup.state.orders[0].tool_uses_remaining, 0); assert.equal(setup.state.results.length, 1); assert.equal(setup.state.events.length, 1);
  assert.equal(setup.log.filter(sql => sql.includes('FROM users') && sql.includes('FOR UPDATE')).length, 2);
});
test('并发重试同一任务仅保存一次和扣一次，之后可重复读取成品', async () => {
  const setup = ledger();
  const results = await Promise.all([setup.save(), setup.save()]);
  assert.equal(results.filter(result => result.reused).length, 1); assert.equal(results.filter(result => result.charged).length, 1); assert.equal(setup.state.orders[0].tool_uses_remaining, 0); assert.equal(setup.state.events.length, 1);
  const restored = await setup.service.findStampResult(1, 40, id);
  assert.equal(restored.image, results[0].image); assert.equal(restored.reused, true);
});

test('付费多格式成品按真实文件头恢复，重复下载保留原始格式且不再次扣次', async () => {
  for (const format of Object.keys(options.stampFormats)) {
    const image = await renderStamp({ ...standard, size: 256, format }), setup = ledger();
    const saved = await setup.service.savePaidStamp(1, 40, id, 'a'.repeat(64), image, 256);
    const restored = await setup.service.findStampResult(1, 40, id);
    const replayed = await setup.service.savePaidStamp(1, 40, id, 'a'.repeat(64), image, 256);
    assert.equal(saved.format, format); assert.equal(restored.format, format); assert.equal(replayed.format, format);
    assert.equal(restored.image, saved.image); assert.equal(replayed.image, saved.image);
    assert.ok(saved.image.startsWith(`data:${options.stampFormats[format].mime};base64,`));
    assert.equal(restored.charged, false); assert.equal(replayed.charged, false);
    assert.equal(setup.state.events.length, 1); assert.equal(setup.state.orders[0].tool_uses_remaining, 0);
  }
});
for (const fail of ['event', 'result']) test(`${fail} 写入失败回滚次数和所有记录，避免扣次但没有成品`, async () => {
  const setup = ledger({ fail });
  await assert.rejects(setup.save(), /写入失败/);
  assert.equal(setup.state.orders[0].tool_uses_remaining, 1); assert.equal(setup.state.events.length, 0); assert.equal(setup.state.results.length, 0); assert.ok(setup.log.includes('ROLLBACK'));
});
test('更改参数或用户重用已完成任务编号被拒绝，不能借用他人成品', async () => {
  const setup = ledger(); await setup.save();
  await assert.rejects(setup.save(id, 'b'.repeat(64)), error => error.status === 409);
  await assert.rejects(setup.save(id, 'a'.repeat(64), 2), error => error.status === 409);
  await assert.rejects(setup.service.findStampResult(1, 40, id, 'b'.repeat(64)), error => error.status === 409);
  assert.equal(await setup.service.findStampResult(2, 40, id), null); assert.equal(await setup.service.findStampResult(1, 99, id), null);
  assert.equal(setup.state.results.length, 1);
});
for (const cycle of ['day', 'week', 'month', 'year', 'once', '']) test(`${cycle || '旧长期'} 会员有效时制作不扣按次余额，成功成品仍保留`, async () => {
  const setup = ledger({ orders: [
    { id: 'times', user_id: 1, product_id: 40, status: 'paid', tool_billing_cycle: 'times', tool_uses_remaining: 3 },
    { id: 'member', user_id: 1, product_id: 40, status: 'delivered', tool_billing_cycle: cycle, tool_paid_at: new Date().toISOString(), tool_uses_remaining: 0 },
  ] });
  const result = await setup.save();
  assert.equal(result.charged, false); assert.equal(setup.state.orders[0].tool_uses_remaining, 3); assert.equal(setup.state.events[0].order, 'member'); assert.equal(setup.state.results.length, 1);
});
test('过期、未来生效、未支付及其他工具的订单均不能制作；停用用户和工具也会复核', async () => {
  const base = { id: 'order', user_id: 1, product_id: 40, status: 'paid', tool_billing_cycle: 'month', tool_paid_at: '2020-01-01T00:00:00Z', tool_uses_remaining: 0 };
  for (const patch of [{}, { tool_paid_at: '2999-01-01T00:00:00Z' }, { tool_billing_cycle: 'once', status: 'pending' }, { tool_billing_cycle: 'once', product_id: 99 }]) await assert.rejects(ledger({ orders: [{ ...base, ...patch }] }).save(), error => error.status === 402);
  await assert.rejects(ledger({ active: false }).save(), error => error.status === 401);
  await assert.rejects(ledger({ toolActive: false }).save(), error => error.status === 409);
});
test('权益状态合并本工具多个按次订单，显示独立会员分类名称', async () => {
  const setup = ledger({ orders: [
    { id: 'times1', user_id: 1, product_id: 40, status: 'paid', tool_billing_cycle: 'times', tool_uses_remaining: 2 },
    { id: 'times2', user_id: 1, product_id: 40, status: 'paid', tool_billing_cycle: 'times', tool_uses_remaining: 3 },
    { id: 'month', user_id: 1, product_id: 40, status: 'paid', tool_billing_cycle: 'month', tool_plan_name: '印章专业会员', tool_paid_at: new Date().toISOString() },
  ] });
  const access = await setup.service.stampAccess(stampTool, { id: 1 });
  assert.equal(access.remaining, 5); assert.equal(access.membershipName, '印章专业会员'); assert.equal(access.canGenerate, true); assert.equal(access.cycle, 'month');
});

const memberPlans = [{ key: 'basic-month', name: '基础会员', cycle: 'month', price: 19.9 }, { key: 'pro-month', name: '专业会员', cycle: 'month', price: 39.9 }, { key: 'single-use', name: '单次制作', cycle: 'times', price: 2.9 }];
test('同周期不同会员分类具有独立标识及价格，旧套餐仍兼容', () => {
  assert.deepEqual(tools.readToolPlans(memberPlans), memberPlans);
  assert.equal(tools.toolPlanKey(memberPlans[1]), 'pro-month'); assert.equal(tools.toolPlanLabel(memberPlans[1]), '专业会员 · 包月');
  assert.equal(tools.toolPlanQuery(memberPlans[1]), 'plan=pro-month&cycle=month');
  assert.deepEqual(tools.readToolPlans(null, 9.9, 'once'), [{ cycle: 'once', price: 9.9 }]);
});
test('后台允许不同分类同周期定价，拒绝重复分类周期、重复标识和异常名称', async () => {
  const saved = [];
  const route = load('../app/api/admin/tools/route.ts', {
    '@/db/mysql-runtime': { env: { DB: { prepare(sql) { let args; return { bind(...values) { args = values; return this; }, async first() { return sql.includes('MAX(sort_order)') ? { sort_order: 1 } : null; }, async run() { saved.push(args); return { meta: { last_row_id: 40 } }; } }; } } } },
    '@/db/setup': { ensurePaymentQrRecords: async () => {} }, '@/lib/tool-services': tools,
    '@/lib/admin-auth': { getAdminContext: async () => ({}), hasAdminPermission: () => true, adminDenied: () => Response.json({}, { status: 403 }) },
  });
  const save = plans => route.POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ action: 'save', name: '印章在线制作', slug: 'stamp-maker', chargeType: 'paid', plans }) }));
  assert.equal((await save(memberPlans)).status, 200); assert.equal(saved[0][6], '/tools/stamp-maker.html'); assert.deepEqual(JSON.parse(saved[0][12]), memberPlans);
  for (const plans of [[memberPlans[0], { ...memberPlans[0], key: 'other' }], [memberPlans[0], { ...memberPlans[1], key: memberPlans[0].key }], [{ ...memberPlans[0], name: '字'.repeat(41) }]]) assert.equal((await save(plans)).status, 400);
});
test('购买时按套餐标识采用对应分类服务端价格并保存快照，缺少分类或伪造标识被拒绝', async () => {
  for (const [key, cycle, expected] of [['pro-month', 'times', 200], [undefined, 'month', 400], ['forged', 'month', 400], ['single-use', 'times', 200]]) {
    const writes = [];
    const route = load('../app/api/orders/route.ts', {
      '@/db/mysql-runtime': { env: { DB: { prepare(sql) { let args; return { bind(...values) { args = values; return this; }, async first() { if (sql.includes('FROM users WHERE phone')) return { id: 1 }; if (sql.includes('FROM products WHERE id')) return { id: 40, product_type: 'tool', tool_slug: 'stamp-maker', tool_url: '', tool_charge_type: 'paid', tool_plans_json: JSON.stringify(memberPlans) }; return null; }, async run() { writes.push(args); return { meta: {} }; } }; } } } },
      '../../../db/setup': { ensureDatabase: async () => {}, getSessionPhone: () => '13800000000' }, '../../../lib/tool-services': tools, '../../../lib/order-notifications': { sendOrderNotification: async () => {} },
    });
    const response = await route.POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify({ productId: 40, toolPlan: key, toolCycle: cycle, price: .01, membershipName: '伪造会员' }) }));
    assert.equal(response.status, expected);
    if (expected === 200) { const selected = memberPlans.find(plan => plan.key === key); assert.equal(writes[0][3], selected.price); assert.equal(writes[0][8], selected.cycle); assert.equal(writes[0][10], selected.key); assert.equal(writes[0][11], selected.name); }
    else assert.equal(writes.length, 0);
  }
});
test('印章独立页渲染商城导航、三栏工作台、各会员套餐及独立购买链接', async () => {
  const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);
  const Image = ({ src, alt }) => React.createElement('img', { src, alt });
  const header = load('../components/storefront-header.tsx', { 'next/link': Link, 'next/image': Image });
  const workspace = load('../components/stamp-maker.tsx', { 'next/link': Link, 'next/image': Image, '../lib/stamp-options': options, '../lib/tool-services': tools });
  const tool = { id: 40, slug: 'stamp-maker', name: '印章在线制作', plans: memberPlans, chargeType: 'paid', detail: '', description: '', seoTitle: '', seoDescription: '', entryConfigured: true };
  const page = load('../app/tools/[slug]/page.tsx', { 'next/link': Link, 'next/image': Image, 'next/navigation': { notFound() { throw new Error('404'); }, permanentRedirect() { throw new Error('redirect'); } }, '@/components/tool-launch': { ToolLaunch: () => null }, '@/components/storefront-header': header, '@/components/stamp-maker': workspace, '@/lib/tool-services': tools, '@/lib/tool-service-data': { getPublishedTool: async () => tool } });
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ slug: 'stamp-maker.html' }) }));
  for (const text of ['主导航', '印章在线制作', '效果预览', '导出下载设置', '导出格式', '基础会员', '专业会员', '单次制作', '制作高清印章', '文字距边框', '印章字体', '宋体', '黑体', '霞鹜文楷']) assert.ok(html.includes(text));
  assert.ok(html.includes('/product/40?plan=basic-month&amp;cycle=month')); assert.ok(html.includes('application/ld+json'));
  const metadata = await page.generateMetadata({ params: Promise.resolve({ slug: 'stamp-maker.html' }) });
  assert.ok(metadata.description.includes('4096'));
});

test('界面可调整间距和字体，切换样式保留选择，重置恢复原设置', () => {
  const slots = [];
  let cursor = 0;
  const react = { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; }, useCallback: fn => fn, useEffect() {} };
  const workspace = load('../components/stamp-maker.tsx', { react, 'next/link': () => null, 'next/image': () => null, '../lib/stamp-options': options, '../lib/tool-services': tools });
  const tool = { id: 40, name: '印章在线制作', chargeType: 'free', plans: [], detail: '' };
  const render = () => { cursor = 0; return workspace.StampMaker({ tool }); };
  const all = node => Array.isArray(node) ? node.flatMap(all) : React.isValidElement(node) ? [node, ...all(node.props.children)] : [];
  const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' ? node : '';
  const control = (tree, title, type) => all(all(tree).find(node => node.type === 'label' && text(node).startsWith(title))).find(node => node.type === type);
  control(render(), '文字距边框', 'input').props.onChange({ target: { value: '68' } });
  control(render(), '印章字体', 'select').props.onChange({ target: { value: 'kai' } });
  control(render(), '导出格式', 'select').props.onChange({ target: { value: 'jpeg' } });
  control(render(), '导出尺寸', 'select').props.onChange({ target: { value: '4096' } });
  assert.equal(control(render(), '图片背景', 'select').props.value, 'white');
  assert.equal(control(render(), '图片背景', 'select').props.disabled, true);
  for (const shape of ['简约椭圆', '方形印章', '个人姓名章', '经典圆章']) {
    all(render()).find(node => node.type === 'button' && text(node).includes(shape)).props.onClick();
    const tree = render();
    assert.equal(control(tree, '印章字体', 'select').props.value, 'kai');
    assert.equal(control(tree, '导出格式', 'select').props.value, 'jpeg');
    assert.equal(control(tree, '导出尺寸', 'select').props.value, 4096);
    const inset = control(tree, '文字距边框', 'input');
    if (['经典圆章', '简约椭圆'].includes(shape)) assert.equal(inset.props.value, 68);
    else assert.equal(inset, undefined);
  }
  all(render()).find(node => node.type === 'button' && text(node) === '重置').props.onClick();
  assert.equal(control(render(), '文字距边框', 'input').props.value, 12);
  assert.equal(control(render(), '印章字体', 'select').props.value, 'serif');
  assert.equal(control(render(), '导出格式', 'select').props.value, 'png');
  assert.equal(control(render(), '图片背景', 'select').props.disabled, false);
});

test('预览失败后可单独重试相同参数，成功后清除错误，始终不发起制作请求', async () => {
  const slots = [], effects = [], requests = [];
  let cursor = 0;
  const react = { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; }, useCallback: fn => fn, useEffect: fn => effects.push(fn) };
  const workspace = load('../components/stamp-maker.tsx', { react, 'next/link': () => null, 'next/image': () => null, '../lib/stamp-options': options, '../lib/tool-services': tools }, {
    window: { setTimeout(fn) { queueMicrotask(fn); return 1; }, clearTimeout() {} }, AbortController,
    async fetch(url, config) {
      assert.equal(url, '/api/tools/stamp-maker/preview');
      requests.push(JSON.parse(config.body));
      return requests.length === 1 ? Response.json({ message: '预览暂不可用' }, { status: 503 }) : new Response('png', { headers: { 'Content-Type': 'image/png' } });
    },
  });
  const render = () => { cursor = 0; effects.length = 0; return workspace.StampMaker({ tool: { id: 40, name: '印章在线制作', chargeType: 'free', plans: [], detail: '' } }); };
  const all = node => Array.isArray(node) ? node.flatMap(all) : React.isValidElement(node) ? [node, ...all(node.props.children)] : [];
  render(); effects[1](); await new Promise(resolve => setImmediate(resolve));
  const retry = all(render()).find(node => node.type === 'button' && node.props.children === '重新预览');
  assert.ok(retry); retry.props.onClick();
  render(); effects[1](); await new Promise(resolve => setImmediate(resolve));
  assert.ok(!all(render()).some(node => node.type === 'button' && node.props.children === '重新预览'));
  assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
  effects[2]()();
});

test('客户端网络重试保留同一任务编号，即使刷新权益后剩余为零也能恢复成品', async () => {
  const slots = [], effects = [], requests = [];
  let cursor = 0, interrupted = false;
  const react = { ...React, useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; }, useCallback: fn => fn, useEffect: fn => effects.push(fn) };
  const Link = ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children);
  const Image = ({ src, alt }) => React.createElement('img', { src, alt });
  const workspace = load('../components/stamp-maker.tsx', { react, 'next/link': Link, 'next/image': Image, '../lib/stamp-options': options, '../lib/tool-services': tools }, {
    window: { setTimeout(fn, delay) { if (!delay) queueMicrotask(fn); return 1; }, clearTimeout() {} }, AbortController,
    async fetch(_, config) {
      if (config?.method === 'POST') {
        const body = JSON.parse(config.body); requests.push(body.id);
        if (!interrupted) { interrupted = true; throw new Error('网络中断'); }
        return Response.json({ result: { id: body.id, image: 'data:image/png;base64,cG5n', size: 1600, charged: true, reused: true, createdAt: new Date().toISOString() } });
      }
      return Response.json({ chargeType: 'paid', signedIn: true, canGenerate: !interrupted, remaining: interrupted ? 0 : 1, cycle: interrupted ? null : 'times', expiresAt: null, membershipName: '单次制作', recent: [] });
    },
  });
  const tool = { id: 40, name: '印章在线制作', chargeType: 'paid', plans: memberPlans, detail: '' };
  const render = () => { cursor = 0; effects.length = 0; return workspace.StampMaker({ tool }); };
  const all = node => Array.isArray(node) ? node.flatMap(all) : React.isValidElement(node) ? [node, ...all(node.props.children)] : [];
  const text = node => Array.isArray(node) ? node.map(text).join('') : React.isValidElement(node) ? text(node.props.children) : typeof node === 'string' ? node : '';
  render(); effects.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve));
  all(render()).find(node => node.type === 'button' && text(node).includes('制作高清印章')).props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  const retry = all(render()).find(node => node.type === 'button' && text(node).includes('重试本次制作'));
  assert.ok(retry); assert.equal(retry.props.disabled, false); retry.props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2); assert.equal(requests[0], requests[1]);
  assert.ok(renderToStaticMarkup(render()).includes('没有重复扣次'));
});
