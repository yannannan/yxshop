import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';
import { getAdminContext, hasAdminPermission } from './admin-auth';
import { getTechnicianContext } from './technician-auth';
import { ChatError, decodeChatMessage, encodeChatMessage } from './consultation-message.mjs';
import { chatStorage, type StoredChatFile } from './consultation-storage.mjs';

export type ChatActor = { audience: 'customer'; userId: number; phone: string; email: string } | { audience: 'admin' } | { audience: 'technician'; userId: number; providerId: number };
type Consultation = { id: number; user_id: number; provider_id: number };
export async function chatActor(request: Request): Promise<ChatActor> {
  const audience = new URL(request.url).searchParams.get('audience');
  if (audience === 'admin') {
    const admin = await getAdminContext(request);
    if (!admin || !hasAdminPermission(admin, 'onsite-consultations')) throw new ChatError('无在线咨询管理权限',403);
    return { audience };
  }
  if (audience === 'technician') {
    const context = await getTechnicianContext(request);
    if (!context) throw new ChatError('当前账号不是已绑定的技术人员',403);
    return { audience, userId:context.user.id, providerId:context.provider.id };
  }
  if (audience !== 'customer') throw new ChatError('会话身份不正确');
  const phone = getVerifiedSessionPhone(request);
  const user = phone ? await env.DB.prepare("SELECT id,email FROM users WHERE phone=? AND status='active'").bind(phone).first<{id:number;email:string}>() : null;
  if (!user) throw new ChatError('请先登录后再使用在线技术支持',401);
  return { audience, userId:Number(user.id), phone:phone!, email:user.email || '' };
}
export function canReadConsultation(actor: ChatActor, consultation: Consultation) {
  return actor.audience === 'admin' || (actor.audience === 'customer' ? Number(consultation.user_id)===actor.userId : Number(consultation.provider_id)===actor.providerId);
}
export async function resolveChatConsultation(actor: ChatActor, input: {serviceSlug:string;consultationId:number}) {
  if (actor.audience !== 'customer') {
    if (!Number.isSafeInteger(input.consultationId) || input.consultationId<1) throw new ChatError('请选择咨询会话');
    const row=await env.DB.prepare('SELECT id,user_id,provider_id FROM technical_consultations WHERE id=?').bind(input.consultationId).first<Consultation>();
    if (!row || !canReadConsultation(actor,row)) throw new ChatError('咨询会话不存在或无权访问',404);
    return Number(row.id);
  }
  const service=await env.DB.prepare("SELECT s.id,s.provider_id,p.name FROM technical_services s JOIN technical_providers p ON p.id=s.provider_id WHERE s.slug=? AND s.status='active' AND p.status='active'").bind(input.serviceSlug).first<{id:number;provider_id:number;name:string}>();
  if (!service) throw new ChatError('技术服务不存在或已下架',404);
  // Serialize first-message creation for the same customer across concurrent requests.
  return env.DB.transaction(async db => {
    await db.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(actor.userId).first();
    const found=await db.prepare('SELECT id FROM technical_consultations WHERE service_id=? AND user_id=? ORDER BY id DESC LIMIT 1').bind(service.id,actor.userId).first<{id:number}>();
    if (found) return Number(found.id);
    const now=new Date().toISOString();
    const created=await db.prepare('INSERT INTO technical_consultations (service_id,provider_id,user_id,customer_phone,customer_email,status,last_message_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(service.id,service.provider_id,actor.userId,actor.phone,actor.email,'open',now,now,now).run();
    const id=Number(created.meta.last_row_id);
    await db.prepare('INSERT INTO technical_consultation_messages (consultation_id,sender_type,sender_id,content,read_at,created_at) VALUES (?,?,?,?,?,?)').bind(id,'provider',null,encodeChatMessage(`您好，我是${service.name}。请说明您的需求、使用场景和期望服务时间。`),null,now).run();
    return id;
  });
}
export async function saveChatMessage(actor: ChatActor, consultationId: number, text: string, file?: File) {
  let attachment: StoredChatFile | undefined, insertedId=0, content='';
  try {
    if (file) attachment=await chatStorage.upload(file,consultationId);
    content=encodeChatMessage(text,attachment);
    const now=new Date().toISOString();
    await env.DB.transaction(async db => {
      const row=await db.prepare('SELECT id,user_id,provider_id FROM technical_consultations WHERE id=? FOR UPDATE').bind(consultationId).first<Consultation>();
      if (!row || !canReadConsultation(actor,row)) throw new ChatError('咨询会话不存在或无权访问',404);
      const message=await db.prepare('INSERT INTO technical_consultation_messages (consultation_id,sender_type,sender_id,content,read_at,created_at) VALUES (?,?,?,?,?,?)').bind(consultationId,actor.audience==='customer'?'customer':'provider',actor.audience==='admin'?null:actor.userId,content,null,now).run();
      insertedId=Number(message.meta.last_row_id);
      await db.prepare("UPDATE technical_consultations SET status='open',last_message_at=?,updated_at=? WHERE id=?").bind(now,now,consultationId).expectChanges(1).run();
    });
    return { ok:true, consultationId, messageId:insertedId };
  } catch (error) {
    // If the connection failed after COMMIT, never delete a file referenced by a saved message.
    let committed=false, known=true;
    if (insertedId) try {
      const row=await env.DB.prepare('SELECT content FROM technical_consultation_messages WHERE id=? AND consultation_id=?').bind(insertedId,consultationId).first<{content:string}>();
      committed=row?.content===content;
    } catch { known=false; }
    if (committed) return { ok:true, consultationId, messageId:insertedId };
    if (attachment && known) await chatStorage.discard(attachment,consultationId);
    throw error;
  }
}
export async function chatAttachment(request: Request, actor: ChatActor) {
  const url=new URL(request.url), id=Number(url.searchParams.get('message')), fileId=url.searchParams.get('file');
  if (!Number.isSafeInteger(id) || id<1 || !fileId) throw new ChatError('附件不存在',404);
  const row=await env.DB.prepare('SELECT m.content,m.consultation_id,c.id,c.user_id,c.provider_id FROM technical_consultation_messages m JOIN technical_consultations c ON c.id=m.consultation_id WHERE m.id=?').bind(id).first<Consultation & {content:string;consultation_id:number}>();
  if (!row || !canReadConsultation(actor,row)) throw new ChatError('附件不存在或无权访问',404);
  const file=decodeChatMessage(row.content).attachments.find(file=>file.id===fileId);
  if (!file) throw new ChatError('附件不存在',404);
  const stream=await chatStorage.download(file,Number(row.consultation_id),request.signal);
  const inline=url.searchParams.get('inline')==='1' && /^image\/(png|jpeg|gif|webp)$/.test(file.mime);
  const encoded=encodeURIComponent(file.name).replace(/['()*]/g,char=>`%${char.charCodeAt(0).toString(16)}`);
  return new Response(stream,{ headers:{ 'Content-Type':inline?file.mime:'application/octet-stream','Content-Length':String(file.size),'Content-Disposition':`${inline?'inline':'attachment'}; filename="attachment"; filename*=UTF-8''${encoded}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cross-Origin-Resource-Policy':'same-origin' } });
}
export function chatFailure(error: unknown) {
  return Response.json({message:error instanceof ChatError?error.message:'消息处理失败，请稍后重试'}, {status:error instanceof ChatError?error.status:503,headers:{'Cache-Control':'no-store'}});
}
