import { readdir, realpath, rm, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { videoObjectStorage } from './video-object-storage.mjs';

const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export async function removeLocalVideoCopy(id, projectRoot = process.cwd()) {
  if (!validId(id)) throw new Error('拒绝清理非法视频任务目录');
  const project = await realpath(projectRoot), expected = resolve(project, 'uploads/video-extractions');
  const root = await realpath(expected).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!root) return false;
  if (root !== expected) throw new Error('拒绝清理链接到项目外的视频目录');
  const target = await realpath(join(root, id)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!target) return false;
  const child = relative(root, target);
  if (isAbsolute(child) || child !== id || target !== resolve(root, id)) throw new Error('拒绝清理不属于当前任务的视频目录');
  await rm(target, { recursive: true, force: true });
  return true;
}

export async function cleanVideoStorage(db, { projectRoot = process.cwd(), retentionHours = 24, now = Date.now(), storage = videoObjectStorage } = {}) {
  const timestamp = new Date(now).toISOString(), result = { localDeleted: 0, failed: 0 };
  const fields = 'id,user_id,format_json,file_extension,file_size,expires_at,status';
  // 已完成的 OSS 视频长期保留。此清理器只回收本地副本和临时文件，不删除云成品。
  const retainedCopies = (await db.prepare(`SELECT ${fields} FROM video_extraction_tasks WHERE status='ready' AND JSON_VALID(format_json) AND JSON_UNQUOTE(JSON_EXTRACT(format_json,'$.storage.provider'))='oss' AND JSON_EXTRACT(format_json,'$.storage.localDeletedAt') IS NULL ORDER BY created_at,id LIMIT 100`).all()).results;
  for (const task of retainedCopies) {
    try {
      if (!storage.readRecord(task)) throw new Error('没有已保存的云文件记录');
      if (await removeLocalVideoCopy(task.id, projectRoot)) result.localDeleted++;
      await db.prepare("UPDATE video_extraction_tasks SET format_json=JSON_SET(format_json,'$.storage.localDeletedAt',?) WHERE id=? AND user_id=? AND status='ready'").bind(timestamp, task.id, task.user_id).run();
    } catch { result.failed++; console.error('视频本地副本清理失败，稍后重试', task.id); }
  }
  const project = await realpath(projectRoot), root = await realpath(resolve(project, 'uploads/video-extractions')).catch(() => null);
  if (root === resolve(project, 'uploads/video-extractions')) {
    const entries = await readdir(root, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (removed >= 100) break;
      if (!entry.isDirectory() || entry.isSymbolicLink() || !validId(entry.name)) continue;
      try {
        const info = await stat(join(root, entry.name));
        if (info.mtimeMs < now - retentionHours * 3600000 && await removeLocalVideoCopy(entry.name, project)) { result.localDeleted++; removed++; }
      } catch (error) { if (error.code !== 'ENOENT') { result.failed++; console.error('视频临时目录清理失败', entry.name); } }
    }
  }
  await db.prepare('DELETE FROM video_extraction_previews WHERE expires_at<?').bind(timestamp).run();
  return result;
}
