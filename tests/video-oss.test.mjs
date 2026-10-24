import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { createVideoObjectStorage, VideoStorageError } from '../lib/video-object-storage.mjs';
import { cleanVideoStorage, removeLocalVideoCopy } from '../lib/video-storage-cleanup.mjs';
import { migrateLocalVideos } from '../lib/video-storage-migration.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const credentials = { VIDEO_STORAGE_DRIVER: 'oss', VIDEO_OSS_BUCKET: 'yxstarshop', VIDEO_OSS_REGION: 'oss-cn-shanghai.aliyuncs.com', VIDEO_OSS_ACCESS_KEY_ID: 'test-only-id', VIDEO_OSS_ACCESS_KEY_SECRET: 'test-only-secret' };
const bytes = Buffer.from('mock-video-bytes');
const pointer = (patch = {}) => ({ provider: 'oss', retention: 'permanent', bucket: 'yxstarshop', region: 'oss-cn-shanghai', key: `yxshop/video-extractions/users/7/${id}/result.mp4`, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ...patch });
const row = (patch = {}) => ({ id, user_id: 7, status: 'ready', file_extension: 'mp4', file_size: bytes.length, expires_at: '2000-01-01T00:00:00Z', format_json: JSON.stringify({ parts: [], storage: pointer() }), ...patch });
const factory = (client, config = {}) => createVideoObjectStorage({ environment: () => ({ ...credentials, ...config }), createClient: () => client, sleep: async () => {} });
const head = (object = pointer()) => ({ res: { headers: { 'content-length': String(object.size), 'x-oss-meta-yxshop-sha256': object.sha256, 'x-oss-meta-yxshop-user': '7', 'x-oss-meta-yxshop-task': id } } });
const missing = () => Object.assign(new Error('not found'), { status: 404, code: 'NoSuchKey' });

async function scratch(t) {
  const parent = await realpath(resolve('tests')), root = await mkdtemp(join(parent, '.oss-test-'));
  t.after(async () => {
    const child = relative(parent, await realpath(root));
    assert.ok(child && !child.startsWith('..') && !isAbsolute(child));
    await rm(root, { recursive: true, force: true });
  });
  return root;
}
async function video(t) {
  const root = await scratch(t), directory = join(root, 'uploads/video-extractions', id), path = join(directory, 'result.mp4');
  await mkdir(directory, { recursive: true }); await writeFile(path, bytes);
  return { root, directory, path, size: bytes.length, id, userId: 7, extension: 'mp4' };
}

test('默认必须配置 OSS，无凭据不退回本地；兼容上海 endpoint，历史本地模式显式可用', async () => {
  assert.equal(createVideoObjectStorage({ environment: () => ({}) }).readiness().ready, false);
  assert.equal(factory({}).readiness().ready, true);
  for (const config of [{ VIDEO_OSS_ACCESS_KEY_SECRET: '' }, { VIDEO_OSS_REGION: 'http://localhost' }, { VIDEO_OSS_BUCKET: '../bucket' }, { VIDEO_OSS_PREFIX: '../escape' }, { VIDEO_STORAGE_DRIVER: 'invalid' }]) assert.equal(factory({}, config).readiness().ready, false);
  const local = createVideoObjectStorage({ environment: () => ({ VIDEO_STORAGE_DRIVER: 'local' }) });
  assert.equal(local.readiness().provider, 'local'); assert.equal(await local.upload({ path: 'not-read' }), null);
});

test('分块上传、MD5 校验、私有 ACL、禁止覆盖；HEAD 验证长度、摘要和任务归属', async t => {
  const input = await video(t); let uploaded, options, exists = false;
  const client = { async head() { if (!exists) throw missing(); return head(); }, async putStream(key, stream, settings) { const chunks = []; for await (const chunk of stream) chunks.push(chunk); uploaded = Buffer.concat(chunks); options = settings; assert.equal(key, pointer().key); exists = true; } };
  const object = await factory(client).upload(input);
  assert.deepEqual(object, pointer()); assert.deepEqual(uploaded, bytes);
  assert.equal(options.contentLength, bytes.length); assert.equal(options.headers['Content-MD5'], createHash('md5').update(bytes).digest('base64'));
  assert.equal(options.headers['x-oss-object-acl'], 'private'); assert.equal(options.headers['x-oss-forbid-overwrite'], 'true'); assert.equal(options.meta['yxshop-task'], id);
  assert.deepEqual(await readFile(input.path), bytes); // 上传层自身绝不先删文件。
});

test('上传响应丢失可 HEAD 恢复；普通失败重开流重试；校验不符禁止覆盖已有对象', async t => {
  const input = await video(t); let exists = false, puts = 0;
  const recovered = factory({ async head() { if (!exists) throw missing(); return head(); }, async putStream(key, stream) { for await (const _ of stream) void _; puts++; exists = true; throw Error('lost response'); } });
  assert.deepEqual(await recovered.upload(input), pointer()); assert.equal(puts, 1);
  const streams = [];
  const retried = factory({ async head() { if (streams.length < 3) throw missing(); return head(); }, async putStream(key, stream) { streams.push(stream); for await (const _ of stream) void _; if (streams.length < 3) throw Error('temporary'); } });
  await retried.upload(input); assert.equal(new Set(streams).size, 3);
  const mismatch = factory({ head: async () => head(pointer({ size: 123 })), putStream: () => { throw Error('must not overwrite'); } });
  await assert.rejects(mismatch.upload(input), error => error instanceof VideoStorageError && error.status === 409);
  assert.deepEqual(await readFile(input.path), bytes);
});

test('OSS 凭据或上传失败不读取成品到内存、不删除本地；错误不泄漏密钥', async t => {
  const input = await video(t); let calls = 0;
  const storage = factory({ async head() { calls++; throw Object.assign(Error('secret-request-url'), { code: 'AccessDenied', status: 403 }); } });
  await assert.rejects(storage.upload(input), error => !error.message.includes('secret') && error.status === 503); assert.equal(calls, 1);
  assert.deepEqual(await readFile(input.path), bytes);
  await assert.rejects(factory({}).upload({ ...input, size: 999 }), /无效/);
});

test('真实 SDK 离线生成公网 V4 签名，成品长期保留，链接每次 15 分钟有效', async () => {
  const storage = createVideoObjectStorage({ environment: () => ({ ...credentials, VIDEO_OSS_INTERNAL_UPLOAD: '1' }) });
  const object = storage.readRecord(row());
  const url = new URL(await storage.downloadUrl(object, { userId: 7, id, extension: 'mp4', title: '中文视频' }));
  assert.equal(url.origin, 'https://yxstarshop.oss-cn-shanghai.aliyuncs.com');
  assert.equal(url.searchParams.get('x-oss-expires'), '900'); assert.equal(url.searchParams.get('x-oss-signature-version'), 'OSS4-HMAC-SHA256');
  assert.match(url.searchParams.get('response-content-disposition'), /attachment;.*UTF-8''%/); assert.ok(!url.href.includes('test-only-secret'));
  const inline = new URL(await storage.downloadUrl(object, { userId: 7, id, extension: 'mp4', title: '视频', inline: true })); assert.match(inline.searchParams.get('response-content-disposition'), /^inline;/);
  await assert.rejects(storage.downloadUrl(object, { userId: 8, id, extension: 'mp4', title: '' }), /不匹配/);
});

test('云文件指针校验归属、文件大小、摘要、路径；旧本地记录继续兼容', () => {
  const storage = factory({}); assert.equal(storage.readRecord(row({ format_json: '{}' })), null);
  for (const object of [pointer({ key: '../result.mp4' }), pointer({ key: pointer().key.replace('/7/', '/8/') }), pointer({ sha256: 'invalid' }), pointer({ size: bytes.length + 1 }), pointer({ region: 'localhost' }), pointer({ retention: '24h' }), pointer({ deletedAt: '2026-10-24' })]) assert.throws(() => storage.readRecord(row({ format_json: JSON.stringify({ storage: object }) })));
});

function mockDb(tasks, { updateFailure = false, lostResponse = false } = {}) {
  const log = [];
  return { log, prepare(sql) { let args = []; log.push(sql); return {
    bind(...values) { args = values; return this; },
    async all() { return { results: sql.includes('localDeletedAt') ? tasks.filter(task => !JSON.parse(task.format_json).storage?.localDeletedAt) : tasks.filter(task => task.status === 'ready' && task.id > args[0]).slice(0, 100) }; },
    async first() { return tasks.find(task => task.id === args[0] && task.user_id === args[1]) || null; },
    async run() {
      if (sql.startsWith('DELETE')) return { meta: { changes: 0 } };
      if (sql.includes('JSON_SET')) { const task = tasks.find(task => task.id === args[1]); const format = JSON.parse(task.format_json); format.storage.localDeletedAt = args[0]; task.format_json = JSON.stringify(format); return { meta: { changes: 1 } }; }
      if (updateFailure) throw Error('DB failed');
      const task = tasks.find(task => task.id === args[1] && task.user_id === args[2] && task.format_json === args[3]);
      if (task) task.format_json = args[0];
      if (lostResponse) throw Error('response lost');
      return { meta: { changes: task ? 1 : 0 } };
    }
  }; } };
}

test('清理只删除已确认的本地副本和旧临时目录，绝不删除长期 OSS 视频', async t => {
  const input = await video(t), tasks = [row()], db = mockDb(tasks); let deletes = 0;
  const storage = { ...factory({}), remove: async () => { deletes++; } };
  const result = await cleanVideoStorage(db, { projectRoot: input.root, storage });
  assert.equal(result.localDeleted, 1); assert.equal(result.failed, 0); assert.equal(deletes, 0); assert.ok(JSON.parse(tasks[0].format_json).storage.localDeletedAt);
  assert.equal(await stat(input.directory).catch(() => null), null);
  assert.equal((await cleanVideoStorage(db, { projectRoot: input.root, storage })).localDeleted, 0);
  assert.ok(!db.log.some(sql => sql.includes('DELETE FROM video_extraction_tasks')));
  await mkdir(input.directory); await writeFile(input.path, bytes); await utimes(input.directory, 1, 1);
  assert.equal((await cleanVideoStorage(mockDb([]), { projectRoot: input.root, storage })).localDeleted, 1);
});

test('清理拒绝非法 UUID / 指向其他位置的目录，损坏云记录不触发即时副本删除', async t => {
  const input = await video(t); await assert.rejects(removeLocalVideoCopy('../escape', input.root));
  const invalid = row({ format_json: JSON.stringify({ storage: pointer({ key: '../result.mp4' }) }) });
  assert.equal((await cleanVideoStorage(mockDb([invalid]), { projectRoot: input.root, storage: factory({}) })).failed, 1); assert.ok(await stat(input.path));
  const other = await scratch(t), otherId = '22222222-2222-4222-8222-222222222222';
  try { await symlink(other, join(input.root, 'uploads/video-extractions', otherId), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (error.code === 'EPERM') return; throw error; }
  await assert.rejects(removeLocalVideoCopy(otherId, input.root), /拒绝/); assert.ok(await stat(other));
});

test('旧成品迁移上传后读回确认才删本地；原账务不变，重复执行不再上传', async t => {
  const input = await video(t), tasks = [row({ format_json: '{}', charged: 1, points_spent: 10 })], db = mockDb(tasks); let uploads = 0;
  const storage = { ...factory({}), upload: async () => { uploads++; assert.ok(await stat(input.path)); return pointer(); } };
  assert.equal((await migrateLocalVideos(db, { projectRoot: input.root, storage })).migrated, 1);
  assert.equal(tasks[0].points_spent, 10); assert.equal(await stat(input.directory).catch(() => null), null);
  assert.equal((await migrateLocalVideos(db, { projectRoot: input.root, storage })).migrated, 0); assert.equal(uploads, 1);
  assert.ok(!db.log.some(sql => /points_|orders|status=/.test(sql) && sql.startsWith('UPDATE') && !sql.includes("status='ready'")));
});

test('迁移写库失败保留本地和原记录；提交响应丢失读回成功则可安全清理', async t => {
  for (const lostResponse of [false, true]) {
    const input = await video(t), tasks = [row({ format_json: '{}' })], db = mockDb(tasks, lostResponse ? { lostResponse } : { updateFailure: true });
    const storage = { ...factory({}), upload: async () => pointer() };
    const result = await migrateLocalVideos(db, { projectRoot: input.root, storage });
    assert.equal(result.migrated, lostResponse ? 1 : 0); assert.equal(result.failed, lostResponse ? 0 : 1);
    assert.equal(Boolean(await stat(input.path).catch(() => null)), !lostResponse);
  }
});
