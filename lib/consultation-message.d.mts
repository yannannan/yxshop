export const chatFileLimit: number;
export class ChatError extends Error { status: number; constructor(message: string, status?: number); }
export type ChatAttachment = { id: string; name: string; size: number; mime: string; image: boolean };
export type ChatRow = { id: string | number; sender_type: string; content: string; created_at: string; attachments?: ChatAttachment[]; consultation_id?: string | number };
export function chatMine(sender: string, audience: string): boolean;
export function chatText(value: unknown): string;
export function encodeChatMessage(text: string, attachment?: unknown): string;
export function decodeChatMessage(value: unknown): { text: string; attachments: Array<import('./consultation-storage.mjs').StoredChatFile> };
export function publicChatMessage(row: unknown): Record<string, unknown> & { content: string; attachments: ChatAttachment[] };
export function readChatRequest(request: Request): Promise<{ text: string; file?: File; consultationId: number; serviceSlug: string }>;
export function requireChatOrigin(request: Request): void;
