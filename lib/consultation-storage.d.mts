export type StoredChatFile = { id: string; name: string; size: number; mime: string; bucket: string; region: string; key: string; sha256: string };
export type ChatStorage = { upload(file: File, consultationId: number): Promise<StoredChatFile>; download(file: StoredChatFile, consultationId: number, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>; discard(file: StoredChatFile, consultationId: number): Promise<void>; validate(file: StoredChatFile, consultationId: number): void };
export const chatStorage: ChatStorage;
export function chatImageMime(bytes: Buffer): string;
