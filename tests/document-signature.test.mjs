import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { crc32 } from 'node:zlib';
import ts from 'typescript';
import { tsImport } from 'tsx/esm/api';
import { degrees, PDFDocument } from 'pdf-lib';
import { PNG } from 'pngjs';
import { createSignatureStorage, SignatureStorageError } from '../lib/signature-oss.mjs';
import { convertSignatureWord, signatureWordReadiness, validateWordArchive } from '../lib/signature-word.mjs';

const spec = await tsImport('../lib/signature-tool.ts', import.meta.url);
const image = await tsImport('../lib/image-tool.ts', import.meta.url);
const render = await tsImport('../lib/signature-render.ts', import.meta.url);
const signingGeometry = await tsImport('../lib/signature-geometry.ts', import.meta.url);
const rasterCodec = await tsImport('../lib/raster-codec.ts', import.meta.url);
const requestHelpers = await tsImport('../lib/image-request.ts', import.meta.url);
const pointsConfig = await tsImport('../lib/points.ts', import.meta.url);
const stampOptions = await tsImport('../lib/stamp-options.ts', import.meta.url);
const stampRenderer = await tsImport('../lib/stamp-renderer.ts', import.meta.url);
const require = createRequire(import.meta.url);
const signatureId = '11111111-1111-4111-8111-111111111111';
const taskId = '22222222-2222-4222-8222-222222222222';
const nextTaskId = '33333333-3333-4333-8333-333333333333';
const position = { signatureId, page: 1, x: .25, y: .25, width: .5, height: .5 };
const red = [220, 28, 43, 255];
const blank = (width, height) => ({ width, height, data: new Uint8Array(width * height * 4) });
const raster = () => ({ width: 1, height: 1, data: new Uint8Array(red) });

test('透明画板裁掉空边，签署图片只改动指定矩形且保留原透明区', () => {
  const drawing = blank(10, 8);
  drawing.data.set(red, (3 * 10 + 4) * 4);
  const signature = render.trimSignature(drawing);
  assert.deepEqual([signature.width, signature.height], [1, 1]);
  const result = PNG.sync.read(render.signImage(blank(8, 8), [position], new Map([[signatureId, signature.png]])));
  assert.deepEqual([...result.data.subarray((2 * 8 + 2) * 4, (2 * 8 + 3) * 4)], red);
  assert.deepEqual([...result.data.subarray(0, 4)], [0, 0, 0, 0]);
  assert.throws(() => render.trimSignature(blank(3, 3)), /签名/);
  assert.throws(() => spec.parseSignaturePlacements([{ ...position, x: .9 }]), /超出/);
  assert.deepEqual(spec.parseSignaturePlacements([position]), [position]);
  assert.throws(() => spec.parseSignaturePlacements([{ ...position, asset: 'unknown' }]), /超出/);
});

test('多页 PDF 签署保留页面数量、可见裁剪和旋转，签名锚点匹配可见页面', async () => {
  const input = await PDFDocument.create();
  for (const angle of [0, 90, 180, 270]) {
    const page = input.addPage([220, 120]);
    page.setCropBox(10, 20, 200, 80);
    page.setRotation(degrees(angle));
  }
  const placements = input.getPages().map((page, index) => {
    const placement = { ...position, page: index + 1, x: .15, y: .3, width: .25, height: .2 };
    const bounds = render.pdfSignaturePosition(page, placement);
    assert.deepEqual([bounds.x, bounds.y, bounds.width, bounds.height].map(value => Number(value.toFixed(6))), [
      [40, 60, 50, 16], [110, 32, 20, 40], [180, 60, 50, 16], [110, 88, 20, 40],
    ][index]);
    return placement;
  });
  const png = render.trimSignature(raster()).png;
  const signed = await PDFDocument.load(await render.signPdf(await input.save(), placements, new Map([[signatureId, png]])));
  assert.equal(signed.getPageCount(), 4);
  assert.deepEqual(signed.getPages().map(page => page.getRotation().angle), [0, 90, 180, 270]);
  for (const page of signed.getPages()) {
    assert.deepEqual(page.getCropBox(), { x: 10, y: 20, width: 200, height: 80 });
    assert.ok(page.node.Resources()?.toString().includes('/XObject'));
  }
});

function storedZip(files) {
  const locals = [], central = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const name = Buffer.from(path), data = Buffer.from(content), crc = crc32(data);
    const local = Buffer.alloc(30), entry = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    central.push(entry, name);
    offset += local.length + name.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test('Word 预处理只接受正常 DOCX 容器，拒绝伪装文件、遍历与宏部件', async () => {
  const files = {
    '[Content_Types].xml': '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
  };
  await validateWordArchive(storedZip(files));
  await assert.rejects(validateWordArchive(Buffer.from('fake Word')), /DOCX/);
  await assert.rejects(validateWordArchive(storedZip({ ...files, '../outside': 'bad' })), /DOCX/);
  await assert.rejects(validateWordArchive(storedZip({ ...files, 'word/vbaProject.bin': 'bad' })), /DOCX/);
});

test('内置 Word 转换将中文与英文保留在 PDF 中', { timeout: 80000 }, async t => {
  if ((await signatureWordReadiness()).engine !== 'wasm') return t.skip('当前环境未使用内置转换器');
  const text = '中文签名验证 Signature probe';
  const source = storedZip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="宋体"/><w:lang w:eastAsia="zh-CN"/></w:rPr><w:t>${text}</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
  });
  const output = await convertSignatureWord(source);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: Uint8Array.from(output) });
  try {
    const pdf = await loading.promise;
    assert.equal(pdf.numPages, 1);
    const { items } = await (await pdf.getPage(1)).getTextContent();
    assert.equal(items.map(item => item.str).join(''), text);
  } finally {
    await loading.destroy();
  }
});

test('OSS 成品为私有对象，短时下载凭据校验归属且不覆盖 Content-Type', async () => {
  const calls = [];
  let object;
  const storage = createSignatureStorage({
    environment: () => ({
      VIDEO_OSS_BUCKET: 'test-bucket', VIDEO_OSS_REGION: 'oss-cn-shanghai',
      VIDEO_OSS_ACCESS_KEY_ID: 'fake', VIDEO_OSS_ACCESS_KEY_SECRET: 'fake',
    }),
    createClient: config => ({
      async put(key, data, options) { object = { key, data, options }; calls.push(['put', config]); },
      async head() { return { res: { headers: { 'content-length': object.data.length } }, meta: object.options.meta }; },
      async signatureUrlV4(method, seconds, options, key) {
        calls.push([method, seconds, options]);
        return `https://test-bucket.oss-cn-shanghai.aliyuncs.com/${key}?signature=test`;
      },
    }),
  });
  assert.equal(storage.ready(), true);
  const result = await storage.upload({ userId: 1, id: taskId, name: '协议-signed.pdf', format: 'pdf', bytes: Buffer.from('sample') });
  assert.equal(object.options.mime, 'application/pdf');
  assert.equal(object.options.headers['x-oss-object-acl'], 'private');
  assert.match(object.options.headers['Content-Disposition'], /^attachment;.*filename\*=UTF-8''/);
  await assert.rejects(storage.downloadUrl(result, 2, taskId), /存储记录异常/);
  assert.match(await storage.downloadUrl(result, 1, taskId), /signature=test$/);
  assert.deepEqual(calls.at(-1), ['GET', 300, { headers: {}, queries: {} }]);
});

function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, Buffer, Response, Request, FormData, URL, Uint8Array, structuredClone,
    console: { error() {} },
    require(name) { return name in mocks ? mocks[name] : require(name); },
  });
  return exports;
}

// Share the route's error class in its VM renderer, as the production module graph does.
const routeRender = load('../lib/signature-render.ts', { './signature-tool': spec,
  './signature-geometry': signingGeometry, './raster-codec': rasterCodec });

function fixture({ failUpload = false, changePrice = false, failSave = false, failHandprintSave = false, stamp = null, missingHandprints = false } = {}) {
  let data = { balance: 100, signatures: {}, handprints: {}, documents: {}, charges: [], signCost: 20 };
  let tail = Promise.resolve();
  const uploads = [], removed = [];
  const tool = { id: 91, tool_charge_type: 'points', tool_points_cost: 10 };
  const db = {
    prepare(sql) {
      const library = () => {
        if (sql.includes('document_handprints') && missingHandprints) throw Object.assign(Error('document_handprints missing'), { code: 'ER_NO_SUCH_TABLE' });
        return sql.includes('document_handprints') ? data.handprints : data.signatures;
      };
      return { bind(...args) {
        const [user, id] = args;
        const key = `${user}:${id}`;
        return {
          async first() {
            if (sql.includes('FROM products')) return tool;
            if (sql.includes('COUNT(*)')) return { total: Object.values(library()).filter(row => !row.deleted_at).length };
            if (/FROM document_(signatures|handprints)/.test(sql)) {
              const row = library()[key];
              return row && !(sql.includes('deleted_at IS NULL') && row.deleted_at) ? row : null;
            }
            if (sql.includes('FROM signed_documents')) return data.documents[key] || null;
            throw Error(sql);
          },
          async all() {
            if (sql.includes('FROM orders')) return { results: [] };
            if (/FROM document_(signatures|handprints)/.test(sql)) return { results: Object.entries(library()).filter(([key, row]) => key.startsWith(`${user}:`) && !row.deleted_at).map(([, row]) => row) };
            if (sql.includes('FROM signed_documents')) return { results: [] };
            throw Error(sql);
          },
          async run() {
            if (/INSERT INTO document_(signatures|handprints)/.test(sql)) {
              const [, , product_id, request_hash, name, png, image_width, image_height, points_spent, created_at] = args;
              if (failHandprintSave && sql.includes('document_handprints')) throw Error('simulated handprint insert failure');
              library()[key] = { id, product_id, request_hash, name, png, image_width, image_height, points_spent, created_at };
            } else if (/UPDATE document_(signatures|handprints)/.test(sql)) {
              const row = library()[`${args[1]}:${args[2]}`];
              if (row && !row.deleted_at) { row.deleted_at = args[0]; row.png = null; }
            } else if (sql.includes('INSERT INTO signed_documents')) {
              if (failSave) throw Error('simulated database insert failure');
              const [, , product_id, request_hash, file_name, file_bytes, points_spent, , expires_at, storage_json] = args;
              data.documents[key] = { id, product_id, request_hash, file_name, file_bytes, points_spent, expires_at, storage_json };
            } else throw Error(sql);
          },
        };
      } };
    },
    transaction(work) {
      const promise = tail.then(async () => {
        const previous = structuredClone(data);
        try { return await work(db); } catch (error) { data = previous; throw error; }
      });
      tail = promise.catch(() => undefined);
      return promise;
    },
  };
  class PointsError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const points = {
    PointsError,
    pointsUser: async request => request.headers.get('test-user') ? { id: Number(request.headers.get('test-user')) } : null,
    lockPointsUser: async () => {},
    pointsBalance: async () => data.balance,
    async consumePoints(_db, user, product, cost, id) {
      if (data.balance < cost) throw new PointsError('积分不足', 402);
      data.balance -= cost;
      data.charges.push({ user, product, cost, id });
      return { pointsSpent: cost };
    },
  };
  const storage = {
    ready: () => true,
    async upload(request) {
      if (failUpload) throw new SignatureStorageError('上传失败');
      if (changePrice) data.signCost = 21;
      const object = { key: 'object-' + uploads.length, size: request.bytes.length };
      uploads.push({ ...request, object });
      return object;
    },
    async discard(object) { removed.push(object.key); },
    async downloadUrl(object) { return 'https://test-bucket.oss-cn-shanghai.aliyuncs.com/' + object.key; },
  };
  const stampService = {
    findStampTool: async () => ({ id: 40 }),
    listStampResults: async (userId, productId) => stamp && userId === stamp.owner && productId === 40 ? [stamp] : [],
    findStampResult: async (userId, productId, id) => stamp && userId === stamp.owner && productId === 40 && id === stamp.id ? stamp : null,
  };
  const signingStamps = load('../lib/signature-stamps.ts', {
    './stamp-options': stampOptions, './stamp-renderer': stampRenderer, './stamp-service': stampService, './signature-tool': spec,
  });
  const service = load('../lib/signature-service.ts', {
    '@/db/mysql-runtime': { env: { DB: db } }, './points-service': points, './points': pointsConfig,
    './tool-module-pricing': { modulePrices: async () => ({ create: 10, sign: data.signCost, handprint: 7 }) },
    './tool-entitlements': { getToolEntitlement: async () => null, usableToolOrder: () => false }, './signature-tool': spec,
    './signature-stamps': signingStamps,
  });
  const response = load('../lib/signature-response.ts', {
    './image-tool': image, './points-service': points, './signature-tool': spec,
    './signature-oss.mjs': { SignatureStorageError },
  });
  const mocks = {
    '@/lib/image-request': requestHelpers, '@/lib/points-service': points, '@/lib/signature-render': routeRender,
    '@/lib/signature-oss.mjs': { signatureStorage: storage }, '@/lib/signature-word.mjs': { signatureWordReady: () => false },
    '@/lib/signature-service': service, '@/lib/signature-tool': spec, '@/lib/signature-response': response,
    '@/lib/signature-stamps': signingStamps, '@/lib/stamp-service': stampService, '@/lib/stamp-options': stampOptions,
  };
  const route = load('../app/api/tools/document-signature/route.ts', mocks);
  const download = load('../app/api/tools/document-signature/[id]/route.ts', mocks);
  function post(metadata, bytes, user = 1) {
    const body = new FormData();
    body.set('metadata', JSON.stringify({ chargeType: 'points', ...metadata }));
    body.set('file', new Blob([bytes]), 'document');
    return route.POST(new Request('https://example.test/api/tools/document-signature', {
      method: 'POST', headers: { 'test-user': String(user), origin: 'https://example.test' }, body,
    }));
  }
  return {
    get data() { return data; }, uploads, removed,
    create: () => post({ action: 'create', id: signatureId, name: '测试签名', cost: 10, width: 1, height: 1 }, raster().data),
    handprint: (user = 1, cost = 7) => post({ action: 'handprint', id: signatureId, name: '测试手印', cost, width: 1, height: 1 }, new Uint8Array([40, 160, 80, 255]), user),
    sign: (user = 1, id = taskId, placements = [position]) => post({ action: 'sign', kind: 'image', id, name: '合同.png', cost: 20,
      width: 8, height: 8, placements }, blank(8, 8).data, user),
    access: user => route.GET(new Request('https://example.test/api/tools/document-signature', {
      headers: user ? { 'test-user': String(user) } : {},
    })),
    stampPreview: user => download.GET(new Request(`https://example.test/api/tools/document-signature/${signatureId}?kind=stamp`,
      { headers: user ? { 'test-user': String(user) } : {} }), { params: Promise.resolve({ id: signatureId }) }),
    handprintPreview: user => download.GET(new Request(`https://example.test/api/tools/document-signature/${signatureId}?kind=handprint`,
      { headers: user ? { 'test-user': String(user) } : {} }), { params: Promise.resolve({ id: signatureId }) }),
    deleteHandprint: user => download.DELETE(new Request(`https://example.test/api/tools/document-signature/${signatureId}?kind=handprint`,
      { method: 'DELETE', headers: { 'test-user': String(user), origin: 'https://example.test' } }), { params: Promise.resolve({ id: signatureId }) }),
    download: user => download.GET(new Request('https://example.test/api/tools/document-signature/' + taskId,
      { headers: { 'test-user': String(user) } }), { params: Promise.resolve({ id: taskId }) }),
  };
}

test('签名和本人印章可同时放置，即使编号相同也使用各自素材，重试只结算一次', async () => {
  const blue = [20, 70, 220, 255];
  const png = new PNG({ width: 256, height: 256 });
  png.data.fill(Buffer.from(blue));
  const stamp = {
    owner: 1, id: signatureId, size: 256, createdAt: '2026-11-09T00:00:00.000Z',
    ...stampOptions.stampImageData(PNG.sync.write(png).toString('base64')),
  };
  const f = fixture({ stamp });
  const own = await (await f.access(1)).json();
  assert.equal(own.stamps.length, 1);
  assert.match(own.stamps[0].previewUrl, /\?kind=stamp$/);
  assert.equal(own.stamps[0].image, undefined);
  assert.deepEqual((await (await f.access(2)).json()).stamps, []);
  assert.deepEqual((await (await f.access()).json()).stamps, []);
  assert.equal((await f.stampPreview(2)).status, 404);
  assert.equal((await f.stampPreview()).status, 401);
  const preview = await f.stampPreview(1);
  assert.equal(preview.headers.get('content-type'), 'image/png');
  assert.equal(PNG.sync.read(Buffer.from(await preview.arrayBuffer())).width, 240);

  const placement = { ...position, x: .75, y: .75, width: .25, height: .25, asset: 'stamp' };
  assert.equal((await f.sign(2, taskId, [placement])).status, 404);
  assert.equal(f.data.balance, 100);
  assert.equal((await f.create()).status, 200);
  assert.equal((await f.sign(1, taskId, [position, placement])).status, 200);
  assert.equal((await f.sign(1, taskId, [position, placement])).status, 200);
  const result = PNG.sync.read(f.uploads[0].bytes);
  assert.deepEqual([...result.data.subarray(72, 76)], red);
  assert.deepEqual([...result.data.subarray(216, 220)], blue);
  assert.deepEqual(f.data.charges.map(charge => charge.cost), [10, 20]);
});

test('制作与签署分别扣积分，同任务并发和再次下载不会重复扣费', async () => {
  const f = fixture();
  assert.equal((await f.create()).status, 200);
  assert.equal((await f.create()).status, 200);
  assert.equal(f.data.balance, 90);
  assert.equal((await f.sign(2)).status, 404);
  const results = await Promise.all([f.sign(), f.sign()]);
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  const [first, second] = await Promise.all(results.map(result => result.json()));
  assert.deepEqual(first, second);
  assert.deepEqual(f.data.charges.map(charge => charge.cost), [10, 20]);
  assert.equal((await f.download(2)).status, 404);
  assert.equal((await f.download(1)).status, 302);
  assert.equal((await f.download(1)).status, 302);
  assert.equal(f.data.balance, 70);
  assert.ok(f.uploads.length === 1 || f.removed.length === 1);
});

test('上传失败、结算前调价或成品入库失败均保留签署积分，失败对象被回收', async () => {
  for (const [options, status, removed] of [
    [{ failUpload: true }, 503, 0], [{ changePrice: true }, 409, 1], [{ failSave: true }, 503, 1],
  ]) {
    const f = fixture(options);
    assert.equal((await f.create()).status, 200);
    assert.equal((await f.sign(1, nextTaskId)).status, status);
    assert.equal(f.data.balance, 90);
    assert.equal(Object.keys(f.data.documents).length, 0);
    assert.equal(f.removed.length, removed);
  }
});

test('手印并发保存幂等、独立定价且只在本人素材库显示，读取下载不再次扣积分', async () => {
  const f = fixture();
  const saved = await Promise.all([f.handprint(), f.handprint()]);
  assert.deepEqual(saved.map(response => response.status), [200, 200]);
  const [first, second] = await Promise.all(saved.map(response => response.json()));
  assert.deepEqual(first, second);
  assert.match(first.signature.previewUrl, /kind=handprint$/);
  assert.ok(first.signature.createdAt);
  assert.equal(f.data.balance, 93); assert.equal(Object.keys(f.data.handprints).length, 1);
  assert.equal((await (await f.access(1)).json()).handprints.length, 1);
  assert.deepEqual((await (await f.access(2)).json()).handprints, []);
  assert.deepEqual((await (await f.access()).json()).handprints, []);
  assert.equal((await f.handprintPreview(2)).status, 404);
  assert.equal((await f.handprintPreview()).status, 401);
  for (let i = 0; i < 2; i++) {
    const response = await f.handprintPreview(1);
    assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.deepEqual([...PNG.sync.read(Buffer.from(await response.arrayBuffer())).data], [40, 160, 80, 255]);
  }
  assert.equal(f.data.charges.length, 1);
});

test('签名、印章和手印相同编号仍可混合签署；删除手印不删除签名，保留历史且禁用素材', async () => {
  const png = new PNG({ width: 256, height: 256 }); png.data.fill(Buffer.from([20, 70, 220, 255]));
  const stamp = { owner: 1, id: signatureId, size: 256, createdAt: new Date().toISOString(), ...stampOptions.stampImageData(PNG.sync.write(png).toString('base64')) };
  const f = fixture({ stamp });
  assert.equal((await f.create()).status, 200); assert.equal((await f.handprint()).status, 200);
  const small = { ...position, width: .25, height: .25 };
  const handprint = { ...small, x: .75, y: .75, asset: 'handprint' };
  const placements = [position, { ...small, x: 0, y: 0, asset: 'stamp' }, handprint];
  assert.equal((await f.sign(2, taskId, placements)).status, 404);
  assert.equal((await f.sign(1, taskId, placements)).status, 200);
  assert.equal((await f.sign(1, taskId, placements)).status, 200);
  const image = PNG.sync.read(f.uploads[0].bytes);
  assert.deepEqual([...image.data.subarray(0, 4)], [20, 70, 220, 255]);
  assert.deepEqual([...image.data.subarray(72, 76)], red);
  assert.deepEqual([...image.data.subarray(216, 220)], [40, 160, 80, 255]);
  assert.deepEqual(f.data.charges.map(row => row.cost), [10, 7, 20]);
  assert.equal((await f.deleteHandprint(2)).status, 200);
  assert.equal((await f.handprintPreview(1)).status, 200);
  assert.equal((await f.deleteHandprint(1)).status, 200);
  assert.equal((await f.handprintPreview(1)).status, 404);
  assert.equal((await (await f.access(1)).json()).signatures.length, 1);
  assert.equal((await (await f.access(1)).json()).handprints.length, 0);
  assert.ok(f.data.handprints[`1:${signatureId}`].deleted_at);
  assert.equal((await f.sign(1, nextTaskId, [handprint])).status, 404);
  assert.equal((await f.download(1)).status, 302, 'old signed result remains available');
  assert.equal(f.data.balance, 63);
});

test('手印调价、余额不足及保存失败不扣积分；缺14号SQL时原签名和签署继续可用', async () => {
  let f = fixture(); assert.equal((await f.handprint(1, 10)).status, 409); assert.equal(f.data.balance, 100);
  f.data.balance = 6; assert.equal((await f.handprint()).status, 402); assert.equal(Object.keys(f.data.handprints).length, 0);
  f = fixture({ failHandprintSave: true }); assert.equal((await f.handprint()).status, 503);
  assert.equal(f.data.balance, 100); assert.equal(f.data.charges.length, 0);
  f = fixture({ missingHandprints: true });
  const access = await f.access(1); assert.equal(access.status, 200); assert.equal((await access.json()).handprintReady, false);
  const response = await f.handprint(); assert.equal(response.status, 503); assert.match((await response.json()).message, /14/);
  assert.equal((await f.create()).status, 200); assert.equal((await f.sign()).status, 200);
});

test('旋转角度进入签署任务指纹，零角度兼容旧重试，非法角度及越界不上传也不结算', async () => {
  const f = fixture(); assert.equal((await f.create()).status, 200);
  for (const rotation of ['90', 181, .5]) {
    assert.equal((await f.sign(1, taskId, [{ ...position, rotation }])).status, 400);
  }
  assert.equal((await f.sign(1, taskId, [{ ...position, x: 0, y: 0, rotation: 45 }])).status, 400);
  assert.equal(f.uploads.length, 0); assert.equal(f.data.balance, 90);
  assert.equal((await f.sign()).status, 200);
  assert.equal((await f.sign(1, taskId, [{ ...position, rotation: 0 }])).status, 200);
  assert.equal((await f.sign(1, taskId, [{ ...position, rotation: 30 }])).status, 409);
  assert.equal(f.data.balance, 70);
  assert.equal((await f.sign(1, nextTaskId, [{ ...position, rotation: 30 }])).status, 200);
  assert.equal((await f.sign(1, nextTaskId, [{ ...position, rotation: 30 }])).status, 200);
  assert.equal(f.data.balance, 50);
  assert.deepEqual(f.data.charges.map(row => row.cost), [10, 20, 20]);
});
