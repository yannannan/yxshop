import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { tsImport } from 'tsx/esm/api';
import React from 'react';

const require = createRequire(import.meta.url);
const id = 'abcdef12-1111-4111-8111-111111111111';
const previewId = 'bbbbbbbb-2222-4222-8222-222222222222';
const tables = { 'signed-document': 'signed_documents', stamp: 'tool_generation_results', image: 'image_processing_results', video: 'video_extraction_tasks' };
const signature = await tsImport('../lib/signature-tool.ts', import.meta.url);
const image = await tsImport('../lib/image-tool.ts', import.meta.url);
const stamp = await tsImport('../lib/stamp-options.ts', import.meta.url);
const video = await tsImport('../lib/video-options.ts', import.meta.url);
const account = await tsImport('../lib/account.ts', import.meta.url);
const { translate } = await tsImport('../lib/i18n.ts', import.meta.url);

function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  vm.runInNewContext(code, { exports, Request, Response, URL, Buffer, AbortController, crypto: webcrypto, console: { error() {} }, setInterval, clearInterval,
    ...globals, require(name) { if (name in mocks) return mocks[name]; if (name.startsWith('node:') || ['react', 'react/jsx-runtime', '@heroicons/react/24/outline'].includes(name)) return require(name); throw Error(`Unexpected dependency ${name}`); } });
  return exports;
}

function fixture({ failCreate = 0 } = {}) {
  const writes = [], queries = [], markers = new Map(), columns = new Set();
  const rows = Object.fromEntries(Object.values(tables).map(table => [table, [{ id, user_id: 1, product_id: 6, request_hash: 'hash',
    name: '我的签名', title: '我的视频', file_name: '合同-signed.pdf', file_bytes: 20, storage_json: '{}', expires_at: '2099-01-01', created_at: '2026-11-20T01:00:00Z',
    points_spent: 10, charged: 1, image_base64: 'iVBORw0KGgo=', image_size: 600, image_width: 100, image_height: 100, image_bytes: 100,
    image_format: 'png', action: 'compress', format_label: '高清', format_json: '{}', file_extension: 'mp4', file_size: 1024, progress: 100, status: 'ready', updated_at: '2026-11-20', error_message: '',
  }]]));
  rows.document_signatures = []; rows.document_handprints = [];
  const billing = { balance: 90, ledger: [{ operation_id: 'original-charge', delta: -10 }], events: ['original-use'], uses: 2 };
  let createAttempts = 0;
  const db = { prepare(sql) {
    let args = [];
    function selectRows(source = sql, bound = args) {
      if (source.includes('UNION ALL')) {
        const inner = source.slice(source.indexOf('(') + 1, source.lastIndexOf(') account_records'));
        let offset = 0;
        return inner.split(' UNION ALL ').flatMap(part => {
          const count = (part.match(/\?/g) || []).length;
          const result = selectRows(part, bound.slice(offset, offset + count)); offset += count;
          return result;
        });
      }
      const queryArgs = source.includes('account_records') && source.includes('LIMIT 10 OFFSET ?') ? bound.slice(0, -1) : bound;
      const table = /FROM (signed_documents|tool_generation_results|image_processing_results|video_extraction_tasks|document_signatures|document_handprints)\b/.exec(source)?.[1];
      if (!table) throw Error(`Unexpected SQL ${source}`);
      let selected = rows[table];
      if (source.includes('WHERE user_id=? AND id=?')) selected = selected.filter(row => row.user_id === queryArgs[0] && row.id === queryArgs[1]);
      else if (source.includes('WHERE id=? AND user_id=?')) selected = selected.filter(row => row.id === queryArgs[0] && row.user_id === queryArgs[1] && (queryArgs.length < 3 || row.product_id === queryArgs[2]));
      else if (source.includes('WHERE id=?')) selected = selected.filter(row => row.id === queryArgs[0]);
      else if (source.includes('WHERE user_id=? AND product_id=?')) selected = selected.filter(row => row.user_id === queryArgs[0] && row.product_id === queryArgs[1]);
      else selected = selected.filter(row => row.user_id === queryArgs.at(-1));
      const kind = Object.keys(tables).find(kind => tables[kind] === table);
      selected = selected.map(row => ({ ...row, result_deleted_at: row.deleted_at || null }));
      if (source.includes(`${table}.deleted_at IS NULL`)) selected = selected.filter(row => !row.result_deleted_at);
      if (source.includes(' AS kind')) selected = selected.map(row => ({ ...row, title: row.title || row.file_name || '印章制作',
        kind: /'([^']+)' AS kind/.exec(source)?.[1] || kind, status: row.result_deleted_at ? 'deleted' : row.status }));
      return selected;
    }
    return { bind(...values) { args = values; return this; },
      async first() { queries.push({ sql, args }); if (sql.includes('FROM information_schema.COLUMNS')) return columns.has(args[0]) ? { present: 1 } : null;
        if (sql.includes('FROM users')) return args[0] === 1 ? { id: 1 } : null;
        const values = selectRows(); return sql.startsWith('SELECT COUNT') ? { total: values.length } : values[0] || null; },
      async all() { queries.push({ sql, args }); if (sql.includes('FROM orders')) return { results: [] }; return { results: selectRows() }; },
      async run() {
        if (sql.startsWith('ALTER TABLE')) { createAttempts++; if (failCreate-- > 0) throw Error('temporarily unavailable'); columns.add(sql.split(' ')[2]); return { meta: { changes: 0 } }; }
        assert.equal((sql.match(/\?/g) || []).length, args.length); writes.push({ sql, args });
        if (/^UPDATE \w+ SET deleted_at=COALESCE\(deleted_at,\?\) WHERE user_id=\? AND id=\?$/.test(sql)) {
          const table = sql.split(' ')[1], kind = Object.keys(tables).find(kind => tables[kind] === table);
          const row = rows[table].find(row => row.user_id === args[1] && row.id === args[2]);
          if (!row) return { meta: { changes: 0 } };
          row.deleted_at ??= args[0]; markers.set(`${row.user_id}:${kind}:${row.id}`, row.deleted_at); return { meta: { changes: 1 } };
        }
        throw Error(`Deletion must never mutate usage or billing: ${sql}`);
      },
    };
  }, async transaction(work) { return work(db); } };
  const runtime = { env: { DB: db } };
  class PointsError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
  const points = { PointsError, async lockPointsUser(db, user) { if (!await db.prepare("SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE").bind(user).first()) throw new PointsError('登录有效账号', 401); }, async pointsBalance() { return billing.balance; } };
  const deletions = load('../lib/tool-result-deletion.ts', { '@/db/mysql-runtime': runtime, './points-service': points });
  const base = { '@/db/mysql-runtime': runtime, '@/db/setup': {}, './points-service': points, './tool-result-deletion': deletions,
    './tool-entitlements': { usableToolOrder: () => false, getToolEntitlement: async () => null }, './tool-services': {}, './tool-module-pricing': { modulePrices: async () => ({}) } };
  const stampService = load('../lib/stamp-service.ts', { ...base, './stamp-options': stamp });
  const imageService = load('../lib/image-tool-service.ts', { ...base, './image-tool': image });
  const signatureService = load('../lib/signature-service.ts', { ...base, './signature-stamps': { listSigningStamps: async () => [] }, './points': {}, './signature-tool': signature });
  let storageReads = 0;
  const videoService = load('../lib/video-service.ts', { ...base, './video-options': video,
    './video-object-storage.mjs': { videoObjectStorage: { readiness: () => ({ ready: true, provider: 'oss' }), readRecord: () => { storageReads++; return {}; } } },
    './video-storage-cleanup.mjs': { cleanVideoStorage: async () => {}, removeLocalVideoCopy: async () => {} }, './video-engine': { videoEngineHealth: async () => ({ engineReady: true }) },
  });
  const accountService = load('../lib/account-service.ts', { ...base, './account': account, './signature-tool': signature });
  const helpers = load('../lib/image-request.ts', { './image-tool': image });
  let signedIn = true;
  const route = load('../app/api/tools/results/[kind]/[id]/route.ts', { '@/lib/image-request': helpers, '@/lib/image-tool': image,
    '@/lib/points-service': { ...points, pointsUser: async () => signedIn ? { id: 1 } : null }, '@/lib/tool-result-deletion': deletions });
  return { db, deletions, rows, billing, writes, queries, markers, route, stampService, imageService, signatureService, videoService, accountService,
    get storageReads() { return storageReads; }, get createAttempts() { return createAttempts; }, set signedIn(value) { signedIn = value; } };
}

for (const kind of Object.keys(tables)) test(`${kind}：仅更新本人成品deleted_at，重复删除幂等，原状态/使用/积分不变`, async () => {
  const f = fixture(), original = structuredClone(f.rows), billing = structuredClone(f.billing);
  await assert.rejects(f.deletions.deleteToolResult(2, kind, id), error => error.status === 401);
  const missingId = 'cccccccc-3333-4333-8333-333333333333';
  await assert.rejects(f.deletions.deleteToolResult(1, kind, missingId), error => error.status === 404);
  await f.deletions.deleteToolResult(1, kind, id);
  const timestamp = f.markers.get(`1:${kind}:${id}`);
  await f.deletions.deleteToolResult(1, kind, id);
  assert.equal(f.markers.size, 1); assert.equal(f.markers.get(`1:${kind}:${id}`), timestamp);
  const expected = structuredClone(original); expected[tables[kind]][0].deleted_at = timestamp;
  assert.deepEqual(f.rows, expected); assert.deepEqual(f.billing, billing); assert.equal(f.createAttempts, 1);
  assert.ok(f.writes.every(row => row.sql.startsWith(`UPDATE ${tables[kind]} SET deleted_at=COALESCE`)));
});

test('删除字段初始化失败可重试，不缓存失败状态且不影响原任务', async () => {
  const f = fixture({ failCreate: 1 });
  await assert.rejects(f.deletions.deleteToolResult(1, 'stamp', id));
  assert.equal(f.markers.size, 0); await f.deletions.deleteToolResult(1, 'stamp', id);
  assert.equal(f.createAttempts, 2); assert.equal(f.rows.tool_generation_results.length, 1);
});

test('视频处理期间拒绝删除，失败或完成后允许，旧下载不再签发 OSS 地址', async () => {
  const f = fixture();
  for (const status of ['queued', 'processing']) {
    f.rows.video_extraction_tasks[0].status = status;
    await assert.rejects(f.deletions.deleteToolResult(1, 'video', id), error => error.status === 409);
    assert.equal(f.markers.size, 0);
  }
  f.rows.video_extraction_tasks[0].status = 'failed'; await f.deletions.deleteToolResult(1, 'video', id);
  await assert.rejects(f.videoService.videoDownloadFile(1, id), error => error.status === 410);
  await assert.rejects(f.videoService.readVideoTask(1, id), error => error.status === 410);
  assert.equal(f.storageReads, 0);
});

test('删除后最近成品列表隐藏，按原编号恢复及重试拒绝且不再次扣费', async () => {
  const f = fixture(), tool = { id: 6, tool_charge_type: 'free', tool_points_cost: 0 }, quote = { chargeType: 'free', cost: 0 };
  const videoHash = createHash('sha256').update(JSON.stringify({ previewId, formatId: 'hd' })).digest('hex');
  f.rows.video_extraction_tasks[0].request_hash = videoHash;
  assert.equal((await f.stampService.listStampResults(1, 6)).length, 1);
  assert.equal((await f.imageService.imageAccess(tool, { id: 1 })).recent.length, 1);
  assert.equal((await f.signatureService.getSignatureAccess(tool, 1, {})).documents.length, 1);
  for (const kind of Object.keys(tables)) await f.deletions.deleteToolResult(1, kind, id);
  assert.equal((await f.stampService.listStampResults(1, 6)).length, 0);
  assert.equal((await f.imageService.imageAccess(tool, { id: 1 })).recent.length, 0);
  assert.equal((await f.signatureService.getSignatureAccess(tool, 1, {})).documents.length, 0);
  const videoAccess = await f.videoService.videoAccess(tool, { id: 1 }, 2);
  assert.equal(videoAccess.total, 0); assert.equal(videoAccess.page, 1); assert.equal(videoAccess.history.length, 0);
  const deleted = error => error.status === 410;
  await assert.rejects(f.stampService.findStampResult(1, 6, id), deleted);
  await assert.rejects(f.stampService.saveStamp(1, 6, id, 'hash', Buffer.from('image'), 600, true), deleted);
  await assert.rejects(f.imageService.findImageResult(1, id), deleted);
  await assert.rejects(f.imageService.saveImageResult(1, 6, id, 'hash', 'compress', quote, {}), deleted);
  await assert.rejects(f.signatureService.findSignedDocument(1, id), deleted);
  await assert.rejects(f.signatureService.saveSignedDocument({ userId: 1, toolId: 6, id, hash: 'hash', quote }, 'test', {}), deleted);
  await assert.rejects(f.videoService.queueVideoTask(1, tool, id, previewId, 'hd'), deleted);
  await assert.rejects(f.videoService.finishVideoTask(1, id, 1024), deleted);
  assert.equal(f.billing.balance, 90); assert.equal(f.billing.events.length, 1); assert.equal(f.billing.ledger.length, 1);
});

test('个人中心保留各类使用记录和总数，已删除成品无下载入口，流水接口保持只读', async () => {
  const f = fixture();
  for (const kind of Object.keys(tables)) {
    await f.deletions.deleteToolResult(1, kind, id);
    const filter = kind === 'signed-document' ? 'signature' : kind;
    const records = await f.accountService.readAccountRecords(1, 'activity', 1, filter);
    assert.equal(records.total, 1, kind); assert.equal(records.items.length, 1, kind);
    assert.equal(records.items[0].status, 'deleted'); assert.equal(records.items[0].href, null);
    assert.equal(account.recordStatusLabel(records.items[0]), '成品已删除');
  }
  const usageRoute = load('../app/api/account/records/route.ts', { '@/lib/account-service': {} });
  assert.equal(typeof usageRoute.GET, 'function'); assert.equal(usageRoute.DELETE, undefined);
  assert.equal(usageRoute.POST, undefined);
});

test('签署素材库隐藏已删除印章，原预览/签署读取返回明确的已删除状态', async () => {
  const f = fixture();
  const stamps = load('../lib/signature-stamps.ts', {
    './stamp-options': stamp, './stamp-service': { ...f.stampService, findStampTool: async () => ({ id: 6 }) },
    './signature-tool': signature, './stamp-renderer': { stampResultPng() { throw Error('Deleted stamps must not be rendered'); } },
  });
  assert.equal((await stamps.listSigningStamps(1)).length, 1);
  await f.deletions.deleteToolResult(1, 'stamp', id);
  assert.equal((await stamps.listSigningStamps(1)).length, 0);
  await assert.rejects(stamps.readSigningStamp(1, 6, id), error => error instanceof signature.SignatureError && error.status === 410);
});

test('统一删除接口校验会话、来源、类型、UUID与归属，不接受使用流水类型', async () => {
  const f = fixture();
  const invoke = (kind = 'stamp', uuid = id, headers = {}) => f.route.DELETE(new Request('https://shop.example/api/tools/results/stamp/id', { method: 'DELETE', headers }), { params: Promise.resolve({ kind, id: uuid }) });
  f.signedIn = false; assert.equal((await invoke()).status, 401); f.signedIn = true;
  assert.equal((await invoke('stamp', id, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await invoke('stamp', id, { 'sec-fetch-site': 'cross-site' })).status, 403);
  for (const kind of ['activity', 'points', 'orders', '__proto__', 'constructor']) assert.equal((await invoke(kind)).status, 404);
  assert.equal((await invoke('stamp', '../private')).status, 404); assert.equal(f.markers.size, 0);
  f.rows.tool_generation_results[0].user_id = 2; assert.equal((await invoke()).status, 404);
  f.rows.tool_generation_results[0].user_id = 1;
  const success = await invoke('stamp', id.toUpperCase(), { origin: 'https://shop.example' });
  assert.equal(success.status, 200); assert.equal((await success.json()).ok, true);
  assert.match(success.headers.get('cache-control'), /private, no-store/);
});

function buttonFixture({ confirm = true, response = { ok: true }, status = 200, disabled = false } = {}) {
  const states = [], refs = [], cleanups = []; let cursor = 0, refCursor = 0, calls = 0, resolve;
  const deleted = [], requests = [];
  const component = load('../components/tool-result-delete.tsx', {
    react: { ...React, useState(initial) { const at = cursor++; states[at] ??= initial; return [states[at], value => { states[at] = typeof value === 'function' ? value(states[at]) : value; }]; },
      useRef(initial) { return refs[refCursor++] ??= { current: initial }; }, useEffect(fn) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } },
    './language-provider': { useI18n: () => ({ t: value => value }) },
  }, { window: { confirm: () => confirm }, fetch: async (url, options) => { calls++; requests.push({ url, ...options }); await new Promise(done => { resolve = done; }); return Response.json(response, { status }); } });
  function render() { cursor = 0; refCursor = 0; return component.ToolResultDelete({ kind: 'stamp', id, disabled, onDeleted: uuid => deleted.push(uuid) }); }
  const button = () => render().props.children[0];
  return { button, render, deleted, requests, get calls() { return calls; }, finish: async () => { resolve(); await new Promise(done => setImmediate(done)); }, unmount: () => cleanups.forEach(fn => fn()) };
}

test('删除按钮取消无请求，重复点击仅一次，成功后通知列表更新', async () => {
  const cancelled = buttonFixture({ confirm: false }); cancelled.button().props.onClick(); assert.equal(cancelled.calls, 0);
  const disabled = buttonFixture({ disabled: true }); disabled.button().props.onClick(); assert.equal(disabled.calls, 0);
  const f = buttonFixture(); f.button().props.onClick(); f.button().props.onClick();
  assert.equal(f.calls, 1); assert.equal(f.button().props.disabled, true); assert.equal(f.requests[0].method, 'DELETE');
  await f.finish(); assert.deepEqual(f.deleted, [id]); assert.equal(f.button().props.disabled, false);
});

test('删除失败保留成品并显示可访问错误，离开页面取消响应回写，中英文提示完整', async () => {
  const f = buttonFixture({ status: 503, response: { message: '删除暂不可用，请稍后重试' } }); f.button().props.onClick(); await f.finish();
  assert.equal(f.deleted.length, 0); assert.equal(f.render().props.children[1].props.role, 'alert');
  const gone = buttonFixture(); gone.button().props.onClick(); gone.unmount(); assert.equal(gone.requests[0].signal.aborted, true); await gone.finish(); assert.equal(gone.deleted.length, 0);
  assert.equal(translate('成品已删除', 'en'), 'Result deleted');
  assert.match(translate('删除此制作记录？删除后该成品将无法查看或下载。工具使用记录和积分消耗明细仍保留，已消耗权益不退回。', 'en'), /usage and points records will remain/);
});
