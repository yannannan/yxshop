import { realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { videoObjectStorage } from './video-object-storage.mjs';
import { removeLocalVideoCopy } from './video-storage-cleanup.mjs';

// 手动迁移旧成品，不生成任务、不改变积分 / 会员 / 次数，也不删除无法确认提交结果的本地文件。
export async function migrateLocalVideos(db, { projectRoot = process.cwd(), storage = videoObjectStorage } = {}) {
  const ready = storage.readiness();
  if (!ready.ready || ready.provider !== 'oss') throw new Error('请先正确配置 OSS 存储');
  const project = await realpath(projectRoot), expected = resolve(project, 'uploads/video-extractions');
  const root = await realpath(expected).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const result = { migrated: 0, skipped: 0, failed: 0 };
  if (!root) return result;
  if (root !== expected) throw new Error('拒绝迁移指向项目外的目录');
  let cursor = '';
  while (true) {
    const rows = (await db.prepare("SELECT id,user_id,file_extension,file_size,format_json,status FROM video_extraction_tasks WHERE status='ready' AND id>? ORDER BY id LIMIT 100").bind(cursor).all()).results;
    if (!rows.length) break;
    for (const row of rows) {
      cursor = row.id;
      try {
        if (storage.readRecord(row)) { result.skipped++; continue; }
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.id) || !['mp4', 'webm', 'mov'].includes(row.file_extension)) throw new Error('历史视频任务不正确');
        const path = join(root, row.id, `result.${row.file_extension}`);
        const actual = await realpath(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        if (!actual) { result.skipped++; continue; } // 文件可能在另一台机器；缺失文件不收费、不伪造云记录。
        if (actual !== path) throw new Error('拒绝迁移链接到其他位置的文件');
        const file = await stat(actual);
        if (!file.isFile() || file.size !== Number(row.file_size)) throw new Error('文件与历史记录不匹配');
        const object = await storage.upload({ path: actual, size: file.size, userId: Number(row.user_id), id: row.id, extension: row.file_extension });
        if (!object) throw new Error('OSS 上传未完成');
        const format = JSON.stringify({ ...JSON.parse(row.format_json), storage: object });
        let updateFailed = false;
        try {
          await db.prepare("UPDATE video_extraction_tasks SET format_json=? WHERE id=? AND user_id=? AND status='ready' AND format_json=? AND file_size=?").bind(format, row.id, row.user_id, row.format_json, row.file_size).run();
        } catch { updateFailed = true; }
        // 即使写入响应丢失，也必须读回确认归属及对象一致之后才删本地。
        const confirmed = await db.prepare('SELECT id,user_id,file_extension,file_size,format_json,status FROM video_extraction_tasks WHERE id=? AND user_id=?').bind(row.id, row.user_id).first();
        const saved = confirmed?.status === 'ready' ? storage.readRecord(confirmed) : null;
        if (!saved || saved.key !== object.key || saved.bucket !== object.bucket || saved.sha256 !== object.sha256) throw new Error(updateFailed ? '迁移写入未确认' : '迁移状态发生变化');
        await removeLocalVideoCopy(row.id, project);
        await db.prepare("UPDATE video_extraction_tasks SET format_json=JSON_SET(format_json,'$.storage.localDeletedAt',?) WHERE id=? AND user_id=? AND status='ready'").bind(new Date().toISOString(), row.id, row.user_id).run();
        result.migrated++;
      } catch { result.failed++; console.error('历史视频迁移未完成，保留本地文件供重试', row.id); }
    }
    if (rows.length < 100) break;
  }
  return result;
}
