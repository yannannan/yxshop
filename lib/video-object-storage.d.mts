export type StoredVideo = {
  provider: 'oss'; retention: 'permanent'; bucket: string; region: string; key: string; size: number; sha256: string; deletedAt?: string; localDeletedAt?: string;
};
export type VideoStorageTask = { id: string; user_id: number; file_extension: string; file_size: number; format_json: string };
export type VideoStorageReadiness = { provider: 'local' | 'oss'; ready: boolean; message: string };
export class VideoStorageError extends Error { status: number; constructor(message: string, status?: number); }
export type VideoObjectStorage = {
  readiness(): VideoStorageReadiness;
  upload(input: { path: string; size: number; userId: number; id: string; extension: string }): Promise<StoredVideo | null>;
  readRecord(task: VideoStorageTask): StoredVideo | null;
  downloadUrl(object: StoredVideo, options: { userId: number; id: string; extension: string; title: string; inline?: boolean }): Promise<string>;
  remove(object: StoredVideo): Promise<void>;
};
export function createVideoObjectStorage(options?: { environment?: () => Record<string, string | undefined>; createClient?: (options: Record<string, unknown>) => unknown; sleep?: (milliseconds: number) => Promise<void> }): VideoObjectStorage;
export const videoObjectStorage: VideoObjectStorage;
