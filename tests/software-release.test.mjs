import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readdir, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { tsImport } from 'tsx/esm/api';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSoftwareStorage } from '../lib/software-storage.mjs';
import { softwareEnglish } from '../lib/software-en.mjs';
const require = createRequire(import.meta.url), spec = await tsImport('../lib/software-release.ts', import.meta.url);
const requestHelpers = await tsImport('../lib/image-request.ts', import.meta.url);
const runtimeEnvironment = { SOFTWARE_OSS_BUCKET: 'yxstarshop', SOFTWARE_OSS_REGION: 'oss-cn-shanghai', SOFTWARE_OSS_ACCESS_KEY_ID: 'test-id', SOFTWARE_OSS_ACCESS_KEY_SECRET: 'test-secret' };
const id1 = '11111111-1111-4111-8111-111111111111', id2 = '22222222-2222-4222-8222-222222222222';
function load(file, mocks = {}, globals = {}) {
  const output = { exports: {} }, code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module: output, exports: output.exports, Buffer, Response, Request, URL, AbortController, console: { error() {} }, ...globals,
    require(name) { if (name in mocks) return mocks[name]; if (name.startsWith('node:') || name.startsWith('react') || name.startsWith('@heroicons')) return require(name); throw Error('Unmocked module ' + name); } });
  return output.exports;
}
const peFile = () => { const bytes = Buffer.alloc(512); bytes.write('MZ'); bytes.writeUInt32LE(128, 60); bytes.write('PE\0\0', 128); return bytes; };
const bodyRequest = bytes => new Request('http://localhost/upload', { method: 'POST', body: bytes });
const request = (path, body, headers = {}) => new Request('http://localhost' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY,name TEXT,product_type TEXT,tool_slug TEXT,status TEXT,tool_charge_type TEXT);
    INSERT INTO products VALUES (77,'免费C盘清理工具','tool','c-drive-cleaner','active','free'),(91,'签名','tool','document-signature','active','points');
    CREATE TABLE tool_software_pages(product_id INTEGER PRIMARY KEY,content_json TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE tool_software_releases(id TEXT PRIMARY KEY,product_id INT,version TEXT,supported_systems TEXT,release_notes TEXT,status TEXT,file_name TEXT,file_size INT,sha256 TEXT,object_json TEXT,upload_token TEXT,upload_started_at TEXT,created_by INT,created_at TEXT,updated_at TEXT,published_at TEXT,download_requests INT,UNIQUE(product_id,version));`);
  const writes = [], uploaded = [], discarded = [], flags = { ready: true, failUpload: false, failVerify: false, loseCommit: false, failSql: '', beforeVerify: null };
  let pending = Promise.resolve();
  const DB = { prepare(original) { let values = [], expected; const sql = original.replace(/ FOR UPDATE/g, '').replace('ON DUPLICATE KEY UPDATE content_json=VALUES(content_json),updated_at=VALUES(updated_at)', 'ON CONFLICT(product_id) DO UPDATE SET content_json=excluded.content_json,updated_at=excluded.updated_at'); return {
    bind(...args) { values = args; return this; }, expectChanges(count) { expected = count; return this; }, async all() { return { results: sqlite.prepare(sql).all(...values) }; }, async first() { return (await this.all()).results[0] || null; },
    async run() { if (flags.failSql && sql.includes(flags.failSql)) { flags.failSql = ''; throw Error('injected write failure'); } const result = sqlite.prepare(sql).run(...values); if (expected !== undefined && result.changes !== expected) throw Error('changed'); writes.push({ sql: original, values }); return { meta: { changes: result.changes } }; },
  }; }, transaction(work) { const task = pending.then(async () => { sqlite.exec('BEGIN'); try { const result = await work(DB); sqlite.exec('COMMIT'); if (flags.loseCommit && writes.at(-1)?.sql.includes('object_json=?')) { flags.loseCommit = false; throw Error('lost committed response'); } return result; } catch (error) { if (sqlite.isTransaction) sqlite.exec('ROLLBACK'); throw error; } }); pending = task.catch(() => {}); return task; } };
  const storage = { ready: () => flags.ready, async upload({ request, release, size, name }) {
    if (flags.failUpload) throw Object.assign(Error('cloud failure'), { status: 503 });
    const data = Buffer.from(await request.arrayBuffer()); assert.equal(size, data.length); uploaded.push({ release, name });
    return { bucket: 'yxstarshop', region: 'oss-cn-shanghai', key: `yxshop/software-releases/c-drive-cleaner/${release}/${randomUUID()}/installer.exe`, size, sha256: createHash('sha256').update(data).digest('hex') };
  }, async verify(object, release) { assert.ok(object.key.includes('/' + release + '/')); if (flags.beforeVerify) { const fn = flags.beforeVerify; flags.beforeVerify = null; fn(); } if (flags.failVerify) throw Object.assign(Error('verification failed'), { status: 503 }); },
    async discard(object) { discarded.push(object); }, async downloadUrl(object, release) { await this.verify(object, release); return `https://yxstarshop.oss-cn-shanghai.aliyuncs.com/${object.key}?signed=test`; } };
  const service = load('../lib/software-release-service.ts', { '@/db/mysql-runtime': { env: { DB } }, './software-storage.mjs': { softwareStorage: storage }, './software-release': spec });
  const auth = allowed => ({ getAdminContext: async () => allowed ? { admin: { id: 9 } } : null, hasAdminPermission: () => allowed, adminDenied: () => new Response('', { status: 403 }) });
  function admin(allowed = true) { return load('../app/api/admin/software/route.ts', { '@/lib/admin-auth': auth(allowed), '@/lib/image-request': requestHelpers, '@/lib/software-release-service': service }); }
  function uploadRoute(allowed = true) { return load('../app/api/admin/software/upload/route.ts', { '@/lib/admin-auth': auth(allowed), '@/lib/image-request': requestHelpers, '@/lib/software-release-service': service, '@/lib/software-release': spec }); }
  const downloads = load('../app/api/tools/software/download/route.ts', { '@/lib/software-release-service': service });
  const create = version => service.createSoftwareRelease(77, 9, { version, systems: 'Windows 10 / 11 x64', notes: '版本说明' });
  const upload = async id => service.uploadSoftwareInstaller(77, id, bodyRequest(peFile()), '宇星清理.exe', 512);
  return { sqlite, service, admin, uploadRoute, downloads, create, upload, writes, uploaded, discarded, flags };
}

test('软件介绍只接受本地截图、有限长度与完整功能，EXE名称不能包含路径或控制字符', () => {
  const page = { ...spec.defaultSoftwarePage, features: [{ title: '清理', detail: '实际功能介绍', titleEn: '', detailEn: '' }], screenshots: [{ url: '/api/product-images?key=products%2Fphoto.png', caption: '首页', captionEn: '' }] };
  assert.equal(spec.parseSoftwarePage(page).features[0].title, '清理');
  assert.equal(spec.parseSoftwarePage(spec.defaultSoftwarePage).screenshots.length, 8);
  for (const url of ['https://example.com/a.png', 'javascript:alert(1)', '/api/product-images?key=products%2F..%2Fsecret.png', '/software/c-drive-cleaner/../secret.png', '/software/c-drive-cleaner/unknown.png', '/software/c-drive-cleaner/overview.png?secret=1']) assert.throws(() => spec.parseSoftwarePage({ ...page, screenshots: [{ ...page.screenshots[0], url }] }), /截图/);
  assert.throws(() => spec.parseSoftwarePage({ ...page, features: [{ title: '', detail: '', titleEn: '', detailEn: '' }] }), /标题和说明/);
  for (const name of ['../app.exe', 'folder\\app.exe', 'app\r\n.exe', 'app.js']) assert.throws(() => spec.installerName(name));
  assert.equal(spec.installerName('宇星清理 (1).exe'), '宇星清理 (1).exe');
});

test('预置8个截图地址均指向项目内真实PNG资源，不依赖Temp目录或本机绝对路径', () => {
  const urls = spec.defaultSoftwarePage.screenshots.map(shot => shot.url); assert.equal(new Set(urls).size, 8);
  for (const url of urls) { assert.match(url, /^\/software\/c-drive-cleaner\/[a-z-]+\.png$/); const bytes = readFileSync(new URL('../public' + url, import.meta.url)); assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))); assert.equal(bytes.readUInt32BE(16), 1920); assert.equal(bytes.readUInt32BE(20), 1009); }
});

test('未发布和缺表时宣传页可展示，草稿信息与云对象不会暴露给公开页面', async () => {
  const f = fixture(), id = await f.create('1.0'); await f.upload(id);
  const view = await f.service.publicSoftware(77, true); assert.equal(view.release, null); assert.equal(view.versions.length, 0); assert.equal(view.page.screenshots.length, 8); assert.match(view.page.features[1].title, /磁盘分析/);
  const admin = await f.service.softwareAdmin(77); assert.equal(admin.releases.length, 1); assert.equal(admin.releases[0].status, 'draft'); assert.equal(JSON.stringify(admin).includes('object_json'), false);
  const missingDB = { prepare() { return { bind() { return this; }, async first() { throw Object.assign(Error('missing'), { code: 'ER_NO_SUCH_TABLE' }); } }; } };
  const service = load('../lib/software-release-service.ts', { '@/db/mysql-runtime': { env: { DB: missingDB } }, './software-storage.mjs': { softwareStorage: { ready: () => false } }, './software-release': spec });
  assert.equal((await service.publicSoftware(77, true)).release, null);
});

test('产品默认介绍按请求复制，保存自定义内容后不会被新预置资料覆盖', async () => {
  const f = fixture(), first = await f.service.publicSoftware(77, true); first.page.features[0].title = '临时修改'; first.page.screenshots.pop();
  const second = await f.service.publicSoftware(77, true); assert.equal(second.page.screenshots.length, 8); assert.notEqual(second.page.features[0].title, '临时修改');
  const page = { ...spec.defaultSoftwarePage, headline: '定制标题', summary: '定制介绍', features: [], screenshots: [] }; await f.service.saveSoftwarePage(77, page);
  const saved = await f.service.publicSoftware(77, true); assert.equal(saved.page.headline, '定制标题'); assert.deepEqual(Array.from(saved.page.screenshots), []); assert.equal((await f.service.softwareAdmin(77)).page.summary, '定制介绍');
});

test('旧默认主标题按最新要求展示且不写业务数据，保留自定义标题与两行文案', async () => {
  const f = fixture();
  for (const headline of ['看清磁盘占用，\n让 C 盘轻装上阵。', '看清磁盘占用，让 C 盘轻装上阵。', '让 C 盘，轻松一点。']) {
    await f.service.saveSoftwarePage(77, { ...spec.defaultSoftwarePage, headline, headlineEn: 'Understand your disk.Make room for what matters.' });
    const before = f.sqlite.prepare('SELECT content_json FROM tool_software_pages').get().content_json, writes = f.writes.length;
    const page = (await f.service.publicSoftware(77, true)).page;
    assert.equal(page.headline, '宇星磁盘管家\n免费C盘清理100%释放'); assert.equal(page.headlineEn, spec.defaultSoftwarePage.headlineEn);
    assert.equal((await f.service.softwareAdmin(77)).page.headline, page.headline); assert.equal(f.writes.length, writes); assert.equal(f.sqlite.prepare('SELECT content_json FROM tool_software_pages').get().content_json, before);
  }
  await f.service.saveSoftwarePage(77, { ...spec.defaultSoftwarePage, headline: '自定义第一行\n自定义第二行' });
  assert.equal((await f.service.publicSoftware(77, true)).page.headline, '自定义第一行\n自定义第二行');
});

test('创建、上传、发布分开执行；免费匿名下载签发有效地址并只增加请求量，不写积分', async () => {
  const f = fixture(), id = await f.create('1.0');
  await assert.rejects(f.service.publishSoftwareRelease(77, id), /先完成EXE/);
  await f.upload(id); assert.equal((await f.service.publicSoftware(77, true)).release, null);
  await f.service.publishSoftwareRelease(77, id);
  const page = await f.service.publicSoftware(77, true); assert.equal(page.release.id, id); assert.equal(page.release.fileSize, 512);
  const response = await f.downloads.GET(new Request('http://localhost/api/tools/software/download?release=' + id));
  assert.equal(response.status, 302); assert.match(response.headers.get('location'), /^https:\/\/yxstarshop\.oss-cn-shanghai\.aliyuncs\.com\//);
  assert.equal(f.sqlite.prepare('SELECT download_requests FROM tool_software_releases').get().download_requests, 1);
  const json = await f.downloads.GET(new Request('http://localhost/api/tools/software/download?release=' + id + '&format=json')); assert.equal(json.status, 200); assert.ok((await json.json()).url);
  assert.equal(f.writes.some(row => /points|wallet|tool_usage|orders/.test(row.sql)), false);
  assert.equal(f.downloads.HEAD().status, 405);
});

test('发布新版本后旧版本下架，旧下载拒绝，允许恢复已发布版本；停用或收费立即阻止下载', async () => {
  const f = fixture(), first = await f.create('1.0'), next = await f.create('2.0'); await f.upload(first); await f.upload(next);
  await Promise.all([f.service.publishSoftwareRelease(77, first), f.service.publishSoftwareRelease(77, next)]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) count FROM tool_software_releases WHERE status='published'").get().count, 1);
  assert.equal((await f.service.publicSoftware(77, true)).release.id, next);
  assert.equal((await f.downloads.GET(new Request('http://localhost/download?release=' + first))).status, 404);
  await f.service.publishSoftwareRelease(77, first); assert.equal((await f.service.publicSoftware(77, true)).release.id, first);
  await assert.rejects(f.service.editSoftwareRelease(77, first, { version: 'change', systems: 'Windows', notes: '' }), /草稿/);
  f.sqlite.exec("UPDATE products SET tool_charge_type='points' WHERE id=77");
  assert.equal((await f.downloads.GET(new Request('http://localhost/download?release=' + first))).status, 404);
  assert.equal((await f.service.publicSoftware(77, false)).release, null);
});

test('跨产品版本、重复版本、未初始化参数与跨站 / 非管理员修改被拒绝', async () => {
  const f = fixture(), id = await f.create('1.0');
  await assert.rejects(f.create('1.0'), /已存在/);
  await assert.rejects(f.service.createSoftwareRelease(91, 9, { version: '1', systems: 'Windows', notes: '' }), /不存在/);
  await assert.rejects(f.service.editSoftwareRelease(77, id1, { version: 'x', systems: 'Windows', notes: '' }), /不存在/);
  assert.equal((await f.admin(false).GET(new Request('http://localhost/api/admin/software?tool=77'))).status, 403);
  assert.equal((await f.admin(false).POST(request('/api/admin/software', { tool: 77, action: 'publish', id }))).status, 403);
  assert.equal((await f.admin().POST(request('/api/admin/software', { tool: 77, action: 'publish', id }, { origin: 'https://evil.invalid' }))).status, 403);
  assert.equal((await f.uploadRoute(false).POST(bodyRequest(peFile()))).status, 403);
});

test('上传失败保留原草稿文件，丢失已提交响应按读回处理，不能误删已保存对象', async () => {
  const f = fixture(), id = await f.create('1.0'); await f.upload(id);
  const original = f.sqlite.prepare('SELECT object_json FROM tool_software_releases').get().object_json;
  f.flags.failUpload = true; await assert.rejects(f.upload(id));
  assert.equal(f.sqlite.prepare('SELECT object_json FROM tool_software_releases').get().object_json, original);
  assert.equal(f.sqlite.prepare('SELECT upload_token FROM tool_software_releases').get().upload_token, '');
  f.flags.failUpload = false; f.flags.loseCommit = true;
  const uploaded = await f.upload(id); assert.equal(uploaded.fileSize, 512);
  const saved = JSON.parse(f.sqlite.prepare('SELECT object_json FROM tool_software_releases').get().object_json);
  assert.equal(f.discarded.some(row => row.key === saved.key), false);
});

test('发布写入失败整批回滚，校验期间文件变化及未完成上传均不能发布', async () => {
  const f = fixture(), first = await f.create('1'), next = await f.create('2'); await f.upload(first); await f.upload(next); await f.service.publishSoftwareRelease(77, first);
  f.flags.failSql = "SET status='published'"; await assert.rejects(f.service.publishSoftwareRelease(77, next));
  assert.equal((await f.service.publicSoftware(77, true)).release.id, first);
  f.flags.beforeVerify = () => f.sqlite.prepare('UPDATE tool_software_releases SET object_json=? WHERE id=?').run('{}', next);
  await assert.rejects(f.service.publishSoftwareRelease(77, next), /安装包已变化/);
  f.sqlite.prepare('UPDATE tool_software_releases SET upload_token=?,upload_started_at=? WHERE id=?').run(id1, new Date().toISOString(), first);
  await assert.rejects(f.service.publishSoftwareRelease(77, first), /完成EXE/);
});

test('云下载验证失败时返回友好错误，无积分与下载计数变化；下架停止公开下载', async () => {
  const f = fixture(), id = await f.create('1'); await f.upload(id); await f.service.publishSoftwareRelease(77, id); f.flags.failVerify = true;
  const response = await f.downloads.GET(new Request('http://localhost/download?release=' + id)); assert.equal(response.status, 503); assert.equal((await response.json()).message, '软件暂时无法下载，请稍后重试');
  assert.equal(f.sqlite.prepare('SELECT download_requests FROM tool_software_releases').get().download_requests, 0);
  f.flags.failVerify = false; await f.service.unpublishSoftwareRelease(77, id);
  assert.equal((await f.service.publicSoftware(77, true)).release, null);
});

async function staging(t) {
  const base = resolve('.vinext/qa-signature-wasm-20261109'); await mkdir(base, { recursive: true });
  const path = await mkdtemp(join(base, 'software-test-')); t.after(async () => { assert.ok(path.startsWith(base + '\\') || path.startsWith(base + '/')); assert.deepEqual(await readdir(path), []); await rmdir(path); }); return path;
}
test('真实流式EXE校验、上传与HEAD核验通过；附件名和SHA256元数据正确，缓存与临时文件已清理', async t => {
  const root = await staging(t), calls = [], data = peFile(); let uploaded;
  const storage = createSoftwareStorage({ environment: () => runtimeEnvironment, stagingRoot: () => root, createClient(options) { assert.equal(options.secure, true); return {
    async putStream(key, stream, config) { const chunks = []; for await (const chunk of stream) chunks.push(chunk); uploaded = Buffer.concat(chunks); calls.push({ key, config }); },
    async head() { return { res: { headers: { 'content-length': '512' } }, meta: { 'yxshop-sha256': createHash('sha256').update(data).digest('hex') } }; },
    async signatureUrlV4(method, expiry, opts, key) { assert.equal(expiry, 300); return `https://yxstarshop.oss-cn-shanghai.aliyuncs.com/${key}?signed=1`; },
  }; } });
  const object = await storage.upload({ request: bodyRequest(data), release: id1, name: '宇星清理.exe', size: data.length });
  assert.deepEqual(uploaded, data); assert.equal(object.sha256, createHash('sha256').update(data).digest('hex')); assert.equal(calls[0].config.contentLength, data.length);
  assert.match(calls[0].config.headers['Content-Disposition'], /filename\*=UTF-8''%/); assert.equal(calls[0].config.headers['x-oss-object-acl'], 'private'); assert.equal(calls[0].config.headers['Content-MD5'], createHash('md5').update(data).digest('base64'));
  assert.deepEqual(await readdir(root), []); assert.match(await storage.downloadUrl(object, id1), /^https:/);
  assert.throws(() => storage.validate(object, id2), /记录异常/);
});

test('伪造EXE、不完整与超额上传在云上传前拒绝，云校验失败仅清理本次对象', async t => {
  const root = await staging(t); let puts = 0, deletes = 0;
  const storage = createSoftwareStorage({ environment: () => runtimeEnvironment, stagingRoot: () => root, createClient: () => ({ async putStream(key, stream) { puts++; for await (const chunk of stream) assert.ok(chunk); }, async head() { return { res: { headers: { 'content-length': '3' } } }; }, async delete() { deletes++; } }) });
  for (const [bytes, size] of [[Buffer.alloc(512), 512], [peFile(), 600], [peFile(), 128]]) await assert.rejects(storage.upload({ request: bodyRequest(bytes), release: id1, name: 'app.exe', size }));
  assert.equal(puts, 0); await assert.rejects(storage.upload({ request: bodyRequest(peFile()), release: id1, name: 'app.exe', size: 512 }), /校验/);
  assert.equal(puts, 1); assert.equal(deletes, 1); assert.deepEqual(await readdir(root), []);
  assert.equal(createSoftwareStorage({ environment: () => ({}) }).ready(), false);
});

test('真实OSS SDK上传固定长度而非chunked，离线V4下载签名不覆盖响应头', async t => {
  const root = await staging(t), data = peFile(), digest = createHash('sha256').update(data).digest('hex'), OSS = require('ali-oss'); let puts = 0;
  const storage = createSoftwareStorage({ environment: () => runtimeEnvironment, stagingRoot: () => root, createClient(options) {
    const sdk = new OSS(options);
    sdk.request = async params => {
      assert.equal(params.method, 'PUT'); assert.equal(Number(params.headers['Content-Length']), data.length); assert.equal(params.headers['Transfer-Encoding'], undefined);
      const chunks = []; for await (const chunk of params.stream) chunks.push(chunk); assert.deepEqual(Buffer.concat(chunks), data); puts++; return { res: { status: 200, headers: {} } };
    };
    sdk.head = async () => ({ res: { headers: { 'content-length': String(data.length) } }, meta: { 'yxshop-sha256': digest } });
    return sdk;
  } });
  const object = await storage.upload({ request: bodyRequest(data), release: id1, name: 'app.exe', size: data.length });
  const url = new URL(await storage.downloadUrl(object, id1)); assert.equal(puts, 1); assert.ok(url.searchParams.get('x-oss-signature'));
  assert.equal(url.searchParams.has('response-content-type'), false); assert.equal(url.searchParams.has('response-content-disposition'), false); assert.deepEqual(await readdir(root), []);
});

test('独立产品页可中英文渲染，未发布按钮禁用，真实截图与公开版本准确展示，JSON-LD不能注入脚本', async () => {
  const f = fixture(), page = { ...spec.defaultSoftwarePage, headline: '我们的清理工具', headlineEn: 'Our cleaner', summary: '说明 </script><script>bad()</script>', summaryEn: 'English product description', screenshots: [{ url: '/api/product-images?key=products%2Fshot.png', caption: '真实软件截图', captionEn: 'Real product screenshot' }] };
  await f.service.saveSoftwarePage(77, page);
  const render = async locale => {
    const i18n = { useI18n: () => ({ locale, t: value => locale === 'en' ? softwareEnglish[value] || value : value }) };
    const button = load('../components/software-download-button.tsx', { './language-provider': i18n, '../lib/software-release': spec });
    const gallery = load('../components/software-showcase.tsx', { './language-provider': i18n });
    const sharedHeader = load('../components/storefront-header.tsx', { '@/components/language-provider': i18n, 'next/image': () => null, './account-menu': { AccountMenu: () => null }, './language-switcher': { LanguageSwitcher: () => null } });
    const component = load('../components/disk-cleaner-landing.tsx', { '../lib/i18n-server': { getI18n: async () => i18n.useI18n() }, '../lib/software-release-service': f.service, '../lib/software-release': spec,
      '../lib/tool-services': { siteOrigin: () => 'https://www.yxstar.shop', toolPagePath: slug => '/tools/' + slug + '.html' }, './storefront-header': sharedHeader, './software-showcase': gallery, './software-download-button': button });
    return renderToStaticMarkup(await component.DiskCleanerLanding({ tool: { id: 77, slug: 'c-drive-cleaner', chargeType: 'free' } }));
  };
  const pending = await render('zh-CN'); const heroBlock = pending.match(/<section class="cleaner-showcase cleaner-showcase-hero"[\s\S]*?<\/section>/)?.[0] || ''; assert.ok(heroBlock.indexOf('/overview.png') < heroBlock.indexOf('/cleanup.png')); assert.ok(heroBlock.indexOf('/cleanup.png') < heroBlock.indexOf('/analysis.png')); assert.match(heroBlock, /overview.png/); assert.match(pending, /版本即将发布/); assert.doesNotMatch(pending, /href="\/api\/tools\/software\/download/); assert.match(pending, /真实软件截图/);
  const schema = JSON.parse(/<script type="application\/ld\+json">([^]*?)<\/script>/.exec(pending)[1]); assert.equal(schema.description, page.summary); assert.doesNotMatch(pending, /<script>bad/);
  const id = await f.create('1.2'); await f.upload(id); await f.service.publishSoftwareRelease(77, id);
  const ready = await render('en'); assert.match(ready, /Our cleaner/); assert.match(ready, /Free download for Windows/); assert.match(ready, /release=/); assert.match(ready, /Windows 10/); assert.match(ready, /SHA256/);
  await f.service.saveSoftwarePage(77, spec.defaultSoftwarePage);
  const standard = await render('zh-CN'); assert.match(standard, /class="cleaner-hero-title">宇星磁盘管家/); assert.match(standard, /class="cleaner-hero-tagline">免费C盘清理100%释放/);
  for (const label of ['AI数字服务','上门技术服务','AI智能获客']) assert.ok(standard.includes(label)); assert.match(standard, /unified-topbar/); assert.doesNotMatch(standard, /class="cleaner-header"/);
});

const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
function hooks() { const slots = []; let cursor = 0; return { slots, reset() { cursor = 0; }, react: { ...React,
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
  useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; }, useId: () => 'test-dialog', useCallback: fn => fn, useEffect() {},
} }; }

test('8张截图支持点击及方向键切换，完整图入口跟随当前图片与英文说明', () => {
  const state = hooks(), component = load('../components/software-showcase.tsx', { react: state.react, './language-provider': { useI18n: () => ({ locale: 'en', t: value => softwareEnglish[value] || value }) } }); let tree, focused = -1;
  function render() { state.reset(); tree = component.SoftwareShowcase({ screenshots: spec.defaultSoftwarePage.screenshots }); }
  const tabs = () => nodes(tree).filter(node => node.props.role === 'tab');
  render(); assert.equal(tabs().length, 8); assert.equal(tabs()[0].props.tabIndex, 0);
  tabs()[4].props.onClick(); render(); assert.ok(nodes(tree).some(node => node.type === 'a' && node.props.href.endsWith('/cleanup.png')));
  const key = value => ({ key: value, preventDefault() {}, currentTarget: { parentElement: { querySelectorAll: () => Array.from({ length: 8 }, (_, i) => ({ focus() { focused = i; } })) } } });
  tabs()[4].props.onKeyDown(key('End')); render(); assert.equal(focused, 7); assert.equal(tabs()[7].props['aria-selected'], true);
  tabs()[7].props.onKeyDown(key('ArrowRight')); render(); assert.equal(focused, 0); assert.equal(tabs()[0].props['aria-selected'], true);
  tabs()[0].props.onKeyDown(key('ArrowLeft')); render(); assert.equal(focused, 7); assert.ok(nodes(tree).some(node => node.type === 'img' && node.props.alt === 'Tool service shortcuts'));
  const arrow = name => nodes(tree).find(node => node.props['aria-label'] === name && node.type === 'button');
  arrow('Next screenshot').props.onClick(); render(); assert.equal(tabs()[0].props['aria-selected'], true);
  arrow('Previous screenshot').props.onClick(); render(); assert.equal(tabs()[7].props['aria-selected'], true);
});

function carouselHarness(initialShots = spec.defaultSoftwarePage.screenshots, reduced = false, variant = 'full') {
  const state = hooks(), effects = [], timers = new Map(), mediaListeners = new Set(), scrolls = [];
  let pendingEffects, sequence = 0, tree, shots = initialShots, observerEvent, observerDisconnected = false;
  const document = { visibilityState: 'visible' }, media = { matches: reduced, addEventListener: (kind, fn) => mediaListeners.add(fn), removeEventListener: (kind, fn) => mediaListeners.delete(fn) };
  const window = { matchMedia: () => media, setTimeout: fn => { const id = ++sequence; timers.set(id, { kind: 'timeout', fn }); return id; }, clearTimeout: id => timers.delete(id), setInterval: (fn, delay) => { assert.equal(delay, 5000); const id = ++sequence; timers.set(id, { kind: 'interval', fn }); return id; }, clearInterval: id => timers.delete(id), scrollTo() { throw Error('Carousel must not scroll the page'); } };
  class Observer { constructor(callback) { observerEvent = callback; } observe() {} disconnect() { observerDisconnected = true; } }
  const strip = { offsetLeft: 20, clientWidth: 500, scrollTo: position => scrolls.push(position), querySelector: () => ({ offsetLeft: 20 + active() * 128, offsetWidth: 116 }) };
  const element = { querySelector: () => strip, contains: target => target === element };
  const component = load('../components/software-showcase.tsx', { react: { ...state.react, useEffect: (fn, deps) => pendingEffects.push({ fn, deps }) }, './language-provider': { useI18n: () => ({ locale: 'en', t: value => softwareEnglish[value] || value }) } }, { window, document, IntersectionObserver: Observer });
  const tabs = () => nodes(tree).filter(node => node.props.role === 'tab');
  const active = () => tabs().findIndex(node => node.props['aria-selected']);
  function render() {
    pendingEffects = []; state.reset(); tree = component.SoftwareShowcase({ screenshots: shots, variant, details: shots.map((shot, i) => ({ url: shot.url, title: 'Detail ' + i, detail: 'Description ' + i, points: ['Point ' + i] })) });
    if (tree) tree.props.ref.current = element;
    pendingEffects.forEach(({ fn, deps }, i) => { const previous = effects[i]; if (!previous || deps.some((value, index) => value !== previous.deps[index])) { previous?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; } });
    return tree;
  }
  function tick() { for (const timer of [...timers.values()]) if (timer.kind === 'interval') timer.fn(); render(); }
  function flushInitial() { for (const [id, timer] of [...timers]) if (timer.kind === 'timeout') { timers.delete(id); timer.fn(); } render(); }
  render();
  return { render, tick, flushInitial, active, document, media, scrolls, tabs, root: () => tree, viewport: () => nodes(tree).find(node => node.props.className === 'cleaner-carousel-viewport'), button: name => nodes(tree).find(node => node.type === 'button' && node.props['aria-label'] === name), intervals: () => [...timers.values()].filter(timer => timer.kind === 'interval').length, offscreen: value => observerEvent([{ isIntersecting: !value }]), changeMotion(value) { media.matches = value; for (const fn of mediaListeners) fn(); render(); }, setShots(value) { shots = value; render(); }, close() { effects.forEach(effect => effect.cleanup?.()); assert.equal(timers.size, 0); assert.equal(mediaListeners.size, 0); assert.equal(observerDisconnected, true); } };
}

test('轮播定时推进并循环，悬停、焦点、后台与屏幕外暂停；手动暂停保持且清理全部计时器', () => {
  const h = carouselHarness(); h.flushInitial(); assert.equal(h.active(), 0); assert.equal(h.intervals(), 1);
  h.tick(); assert.equal(h.active(), 1); assert.ok(nodes(h.root()).some(node => node.type === 'h4' && node.props.children === 'Detail 1'));
  h.root().props.onPointerEnter({ pointerType: 'mouse' }); h.render(); assert.equal(h.intervals(), 0); h.tick(); assert.equal(h.active(), 1);
  h.root().props.onPointerLeave(); h.render(); h.root().props.onFocusCapture(); h.render(); assert.equal(h.intervals(), 0);
  h.root().props.onBlurCapture({ currentTarget: { contains: () => true }, relatedTarget: {} }); h.render(); assert.equal(h.intervals(), 0);
  h.root().props.onBlurCapture({ currentTarget: { contains: () => false }, relatedTarget: null }); h.render(); assert.equal(h.intervals(), 1);
  h.document.visibilityState = 'hidden'; h.tick(); assert.equal(h.active(), 1); h.document.visibilityState = 'visible';
  h.offscreen(true); h.tick(); assert.equal(h.active(), 1); h.offscreen(false);
  h.tabs()[7].props.onClick(); h.render(); h.tick(); assert.equal(h.active(), 0);
  h.button('Pause slideshow').props.onClick(); h.render(); h.tick(); assert.equal(h.active(), 0); assert.equal(h.intervals(), 0);
  h.button('Start slideshow').props.onClick(); h.render(); h.tick(); assert.equal(h.active(), 1); assert.ok(h.scrolls.every(position => position.left >= 0)); h.close();
});

test('双指与纵向手势不误翻页，单指横向滑动可切换；图片数量变化与单图空图安全', () => {
  const h = carouselHarness(); h.flushInitial(); let captured = false;
  const event = (x, y, extra = {}) => ({ pointerType: 'touch', pointerId: 1, isPrimary: true, clientX: x, clientY: y, target: { closest: () => null }, currentTarget: { setPointerCapture() { captured = true; }, hasPointerCapture: () => captured, releasePointerCapture() { captured = false; } }, ...extra });
  h.viewport().props.onPointerDown(event(200,100)); h.tick(); assert.equal(h.active(), 0);
  h.viewport().props.onPointerUp(event(100,108)); h.render(); assert.equal(h.active(), 1); assert.equal(captured, false);
  h.viewport().props.onPointerDown(event(100,100)); h.viewport().props.onPointerUp(event(155,210)); h.render(); assert.equal(h.active(), 1);
  h.viewport().props.onPointerDown(event(100,100)); h.viewport().props.onPointerDown(event(110,110,{pointerId:2,isPrimary:false})); h.viewport().props.onPointerUp(event(200,100)); h.render(); assert.equal(h.active(), 1);
  h.viewport().props.onPointerDown(event(100,100)); h.viewport().props.onPointerCancel(); h.viewport().props.onPointerUp(event(200,100)); h.render(); assert.equal(h.active(), 1);
  h.viewport().props.onPointerDown(event(100,100)); h.viewport().props.onPointerUp(event(200,100)); h.render(); assert.equal(h.active(), 0);
  h.tabs()[7].props.onClick(); h.render(); h.setShots(spec.defaultSoftwarePage.screenshots.slice(0,2)); assert.equal(h.active(), 1);
  h.setShots(spec.defaultSoftwarePage.screenshots.slice(0,1)); assert.equal(h.active(), 0); assert.equal(h.intervals(), 0); assert.equal(h.button('Next screenshot'), undefined);
  h.setShots([]); assert.equal(h.root(), null); assert.equal(h.intervals(), 0); h.close();
});

test('低动态偏好默认不自动播放，用户可主动开始；偏好变更立即停止', () => {
  const h = carouselHarness(undefined, true); h.tick(); assert.equal(h.active(), 0); h.flushInitial(); assert.equal(h.intervals(), 0);
  h.button('Start slideshow').props.onClick(); h.render(); h.tick(); assert.equal(h.active(), 1);
  h.changeMotion(true); h.tick(); assert.equal(h.active(), 1); assert.equal(h.intervals(), 0); h.close();
});
test('管理界面可创建草稿、上传中文文件名EXE并独立发布，上传前发布按钮禁用', async () => {
  const f = fixture(), state = hooks(); let tree, filePicker = 0;
  class Upload {
    constructor() { this.upload = {}; this.headers = {}; }
    open(method, url) { assert.equal(method, 'POST'); this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(file) { this.upload.onprogress?.({ lengthComputable: true, loaded: file.size, total: file.size });
      void f.uploadRoute().POST(new Request('http://localhost' + this.url, { method: 'POST', headers: this.headers, body: file })).then(async response => { this.status = response.status; this.responseText = await response.text(); this.onload(); });
    }
    abort() { this.onabort?.(); }
  }
  const component = load('../components/admin-software-publishing.tsx', { react: state.react, '../lib/software-release': spec }, {
    XMLHttpRequest: Upload, document: { activeElement: { focus() {} } },
    fetch: async (url, options) => options?.method === 'POST' ? f.admin().POST(request(url, JSON.parse(options.body))) : f.admin().GET(new Request('http://localhost' + url)),
  });
  function render() { state.reset(); tree = component.SoftwarePublishing({ id: 77, onClose() {} }); for (const node of nodes(tree)) if (node.type === 'input' && node.props.accept === '.exe') node.props.ref.current = { click() { filePicker++; } }; }
  const button = label => nodes(tree).find(node => node.type === 'button' && node.props.children === label);
  render(); state.slots[0] = await f.service.softwareAdmin(77); render();
  nodes(tree).find(node => node.props.placeholder === '例如：1.0.0').props.onChange({ target: { value: '1.0.0' } }); render();
  nodes(tree).find(node => node.props.placeholder === '按软件实际兼容系统填写').props.onChange({ target: { value: 'Windows 10 / 11 x64' } }); render();
  await button('创建草稿版本').props.onClick(); for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); render();
  assert.equal(button('发布').props.disabled, true); assert.equal(f.sqlite.prepare('SELECT status FROM tool_software_releases').get().status, 'draft');
  button('上传EXE').props.onClick(); assert.equal(filePicker, 1);
  const file = new File([peFile()], '宇星清理.exe', { type: 'application/octet-stream' });
  nodes(tree).find(node => node.props.accept === '.exe').props.onChange({ target: { value: 'picked', files: [file] } });
  for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); render();
  assert.equal(f.uploaded[0].name, file.name); assert.equal(button('发布').props.disabled, false);
  assert.equal(f.sqlite.prepare('SELECT status FROM tool_software_releases').get().status, 'draft', 'upload must not publish automatically');
  await button('发布').props.onClick(); for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve)); render();
  assert.equal(f.sqlite.prepare('SELECT status FROM tool_software_releases').get().status, 'published'); assert.ok(button('下架'));
  await f.service.saveSoftwarePage(77, { ...spec.defaultSoftwarePage, headline: '已保存的定制标题', screenshots: [] });
  button('宣传内容与截图').props.onClick(); render(); button('恢复预置内容').props.onClick(); render();
  assert.equal((await f.service.softwareAdmin(77)).page.headline, '已保存的定制标题', 'loading defaults must not save without a separate click');
  await button('保存产品介绍与截图').props.onClick(); for (let i = 0; i < 3; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.service.softwareAdmin(77)).page.screenshots.length, 8);
});

test('下载按钮保留原生下载地址，正常点击先核验再转云附件；失败留在原页并显示回执', async () => {
  const f = fixture(), state = hooks(), links = []; const id = await f.create('1'); await f.upload(id); await f.service.publishSoftwareRelease(77, id);
  let fail = false, tree, prevented = 0;
  const component = load('../components/software-download-button.tsx', { react: state.react, './language-provider': { useI18n: () => ({ t: value => value }) }, '../lib/software-release': spec }, {
    window: { location: { assign: url => links.push(url) } },
    fetch: async url => fail ? Response.json({ message: '软件暂时无法下载，请稍后重试' }, { status: 503 }) : f.downloads.GET(new Request('http://localhost' + url)),
  });
  function render() { state.reset(); tree = component.SoftwareDownloadButton({ id, name: 'app.exe', ready: true }); }
  render(); const anchor = () => nodes(tree).find(node => node.type === 'a'); assert.equal(anchor().props.href, spec.softwareDownloadPath(id));
  await anchor().props.onClick({ button: 0, ctrlKey: true, preventDefault() { prevented++; } }); assert.equal(prevented, 0); assert.equal(links.length, 0);
  await anchor().props.onClick({ button: 0, preventDefault() { prevented++; } }); render(); assert.equal(prevented, 1); assert.equal(links.length, 1); assert.match(links[0], /^https:/);
  fail = true; await anchor().props.onClick({ button: 0, preventDefault() {} }); render();
  assert.equal(links.length, 1); assert.ok(nodes(tree).some(node => node.props.role === 'alert' && node.props.children.includes('稍后重试')));
});


test('首屏独立三图依次为首页/C盘清理/磁盘分析，自动轮播及点击切换不影响下方完整图库', () => {
  const shots = ['overview', 'cleanup', 'analysis'].map(name => spec.defaultSoftwarePage.screenshots.find(shot => shot.url.endsWith('/' + name + '.png')));
  const hero = carouselHarness(shots, false, 'hero'), full = carouselHarness(); hero.flushInitial(); full.flushInitial();
  assert.ok(hero.root().props.className.includes('cleaner-showcase-hero')); assert.equal(hero.tabs().length, 3); assert.equal(full.tabs().length, 8);
  assert.equal(hero.active(), 0); hero.tick(); assert.equal(hero.active(), 1); hero.tick(); assert.equal(hero.active(), 2); hero.tick(); assert.equal(hero.active(), 0);
  hero.tabs()[2].props.onClick(); hero.render(); assert.equal(hero.active(), 2); assert.equal(full.active(), 0);
  assert.equal(nodes(hero.root()).some(node => node.props.className === 'cleaner-carousel-detail'), false);
  hero.close(); full.close();
});
