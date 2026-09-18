import { DatabaseSync } from 'node:sqlite';
import { copyFile, mkdir } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const root = process.cwd();
const r2Root = join(root, '.wrangler', 'state', 'v3', 'r2');
const objectDbDirectory = join(r2Root, 'miniflare-R2BucketObject');
const objectDbName = readdirSync(objectDbDirectory).find((name) => name.endsWith('.sqlite') && name !== 'metadata.sqlite');
if (!objectDbName) throw new Error('找不到本地 R2 对象索引。');
const database = new DatabaseSync(join(objectDbDirectory, objectDbName), { readOnly: true });
const objects = database.prepare("SELECT key,blob_id FROM _mf_objects WHERE key LIKE 'products/%'").all();
const blobDirectory = join(r2Root, 'site-creator-r2', 'blobs');
const uploadDirectory = process.env.UPLOAD_DIR || join(root, 'uploads');

let copied = 0;
for (const object of objects) {
  const key = String(object.key);
  if (normalize(key).includes('..')) continue;
  const source = join(blobDirectory, String(object.blob_id));
  const target = join(uploadDirectory, key);
  if (!existsSync(source)) { console.warn(`跳过缺失文件：${key}`); continue; }
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
  copied += 1;
}
database.close();
console.log(`图片迁移完成：${copied}/${objects.length} 个文件已复制至 ${uploadDirectory}`);
