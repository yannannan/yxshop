import type { VideoObjectStorage } from './video-object-storage.mjs';
type Statement = { bind(...values: unknown[]): Statement; all<T>(): Promise<{ results: T[] }>; run(): Promise<unknown> };
export type VideoStorageDatabase = { prepare(sql: string): Statement };
export function removeLocalVideoCopy(id: string, projectRoot?: string): Promise<boolean>;
export function cleanVideoStorage(db: VideoStorageDatabase, options?: { projectRoot?: string; retentionHours?: number; now?: number; storage?: VideoObjectStorage }): Promise<{ localDeleted: number; failed: number }>;
