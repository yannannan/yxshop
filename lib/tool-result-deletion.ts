import { env } from '@/db/mysql-runtime';
import { lockPointsUser, type PointsDatabase } from './points-service';

export const resultTables = {
  'signed-document': 'signed_documents',
  stamp: 'tool_generation_results',
  image: 'image_processing_results',
  video: 'video_extraction_tasks',
} as const;
export type ToolResultKind = keyof typeof resultTables;
export const isToolResultKind = (kind: string): kind is ToolResultKind => Object.hasOwn(resultTables, kind);

export class ToolResultError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// A separate field keeps completion/billing status intact. Initialize only the
// module being used so an uninstalled tool cannot block other history pages.
const ready = new Map<ToolResultKind, Promise<void>>();
export function ensureToolResultDeletions(kind: ToolResultKind) {
  const previous = ready.get(kind);
  if (previous) return previous;
  const pending = (async () => {
    const column = await env.DB.prepare("SELECT 1 AS present FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME='deleted_at'")
      .bind(resultTables[kind]).first();
    if (column) return;
    try {
      await env.DB.prepare(`ALTER TABLE ${resultTables[kind]} ADD COLUMN deleted_at VARCHAR(40) NULL`).run();
    } catch (error) {
      // Another application process may have added the same column meanwhile.
      if ((error as { code?: string }).code !== 'ER_DUP_FIELDNAME') throw error;
    }
  })().catch(error => { ready.delete(kind); throw error; });
  ready.set(kind, pending);
  return pending;
}

// Both arguments come from the fixed server-side map, never from request SQL.
export function resultDeletedAt(kind: ToolResultKind, table = resultTables[kind]) {
  return `${table}.deleted_at`;
}
export const visibleToolResults = (kind: ToolResultKind) => `${resultDeletedAt(kind)} IS NULL`;

export async function deleteToolResult(userId: number, kind: ToolResultKind, id: string) {
  await ensureToolResultDeletions(kind);
  return env.DB.transaction(async (db: PointsDatabase) => {
    await lockPointsUser(db, userId);
    const row = await db.prepare(`SELECT id${kind === 'video' ? ',status' : ''} FROM ${resultTables[kind]} WHERE user_id=? AND id=? FOR UPDATE`)
      .bind(userId, id).first<{ id: string; status?: string }>();
    if (!row) throw new ToolResultError('制作记录不存在或不属于当前账号', 404);
    if (row.status === 'queued' || row.status === 'processing') throw new ToolResultError('正在处理的任务暂不能删除，请完成后再试', 409);
    await db.prepare(`UPDATE ${resultTables[kind]} SET deleted_at=COALESCE(deleted_at,?) WHERE user_id=? AND id=?`)
      .bind(new Date().toISOString(), userId, id).run();
  });
}
