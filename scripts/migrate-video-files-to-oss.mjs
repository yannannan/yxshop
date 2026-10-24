import { migrateLocalVideos } from '../lib/video-storage-migration.mjs';
import { videoStorageCommand } from './video-storage-db.mjs';

videoStorageCommand(migrateLocalVideos).catch(() => { console.error('历史视频迁移未完成，请检查 OSS / 数据库配置，修复后可重新执行'); process.exitCode = 1; });
