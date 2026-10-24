import { cleanVideoStorage } from '../lib/video-storage-cleanup.mjs';
import { videoStorageCommand } from './video-storage-db.mjs';

// 仅清理本地临时 / 重复文件和过期解析缓存，不删除长期保存的 OSS 成品。
videoStorageCommand(cleanVideoStorage).catch(() => { console.error('视频临时文件清理失败，请检查数据库配置和目录权限'); process.exitCode = 1; });
