export const chatFileLimit = 20 * 1024 * 1024;
const prefix = 'YXCHAT1:';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export class ChatError extends Error {
  constructor(message, status = 400) { super(message); this.name = 'ChatError'; this.status = status; }
}
export function encodeChatMessage(text, attachment) {
  return attachment || text.startsWith(prefix) ? prefix + JSON.stringify({ v: 1, text, attachments: attachment ? [attachment] : [] }) : text;
}
export function decodeChatMessage(value) {
  const raw = String(value || '');
  if (raw.startsWith(prefix)) try {
    const data = JSON.parse(raw.slice(prefix.length));
    if (data.v === 1 && typeof data.text === 'string' && Array.isArray(data.attachments) && data.attachments.length <= 1) return { text: data.text, attachments: data.attachments };
  } catch { /* Legacy text is displayed verbatim. */ }
  return { text: raw, attachments: [] };
}
export function publicChatMessage(row) {
  if (!row || typeof row !== 'object') return { content: '', attachments: [] };
  const data = decodeChatMessage(row.content);
  return { ...row, content: data.text, attachments: data.attachments.filter(file => uuid.test(file?.id) && typeof file.name === 'string' && Number.isSafeInteger(file.size) && file.size > 0 && file.size <= chatFileLimit).map(file => ({ id: file.id, name: file.name, size: file.size, mime: file.mime, image: /^image\/(png|jpeg|gif|webp)$/.test(file.mime) })) };
}
export function chatMine(sender, audience) { return audience === 'customer' ? sender === 'customer' : sender === 'provider'; }
export function chatText(value) {
  if (typeof value !== 'string') throw new ChatError('请输入消息内容或选择附件');
  const text = value.trim();
  if (text.length > 4000) throw new ChatError('消息最多4000字');
  return text;
}
export async function readChatRequest(request) {
  const contentType = request.headers.get('content-type') || '', multipart = contentType.startsWith('multipart/form-data;');
  if (!multipart && !contentType.startsWith('application/json')) throw new ChatError('消息格式不正确');
  const limit = multipart ? chatFileLimit + 128 * 1024 : 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new ChatError('附件最大20MB', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ChatError('消息不能为空');
  const parts = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new ChatError('附件最大20MB', 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(parts);
  let body, file;
  try {
    if (multipart) {
      const form = await new Response(bytes, { headers: { 'content-type': contentType } }).formData();
      const files = [...form.values()].filter(value => typeof value !== 'string');
      if (files.length > 1 || (files.length === 1 && form.get('file') !== files[0])) throw new ChatError('每条消息最多发送一个附件');
      file = files[0];
      body = Object.fromEntries([...form].filter(([, value]) => typeof value === 'string'));
    } else body = JSON.parse(bytes.toString('utf8'));
  } catch (error) { throw error instanceof ChatError ? error : new ChatError('消息格式不正确'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ChatError('消息格式不正确');
  const text = chatText(body.content ?? '');
  if (!text && !file) throw new ChatError('请输入消息内容或选择附件');
  if (file && (!file.size || file.size > chatFileLimit)) throw new ChatError('附件不能为空且最大20MB', 413);
  return { text, file, consultationId: Number(body.consultationId), serviceSlug: String(body.serviceSlug || '').trim().slice(0, 200) };
}
export function requireChatOrigin(request) {
  const target = new URL(request.url), origin = request.headers.get('origin');
  let same = !origin || origin === target.origin;
  if (!same) try { const source = new URL(origin); same = target.protocol === 'http:' && source.protocol === 'https:' && source.host === target.host && request.headers.get('x-forwarded-proto')?.split(',')[0].trim() === 'https'; } catch { same = false; }
  if (!same || request.headers.get('sec-fetch-site') === 'cross-site') throw new ChatError('请从本站发送消息', 403);
}
