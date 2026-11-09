import { requireImageOrigin } from '@/lib/image-request';
import { pointsUser } from '@/lib/points-service';
import { signatureFailure, signatureHeaders } from '@/lib/signature-response';
import { deleteSignature, findSignedDocument, readSignatureImage } from '@/lib/signature-service';
import { signatureStorage } from '@/lib/signature-oss.mjs';
import { isSignatureId, SignatureError } from '@/lib/signature-tool';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

async function identity(request: Request, context: Context) {
  const user = await pointsUser(request);
  if (!user) throw new SignatureError('请登录后使用文件签名', 401);
  const { id } = await context.params;
  if (!isSignatureId(id)) throw new SignatureError('签名记录不存在', 404);
  return { userId: user.id, id };
}

export async function GET(request: Request, context: Context) {
  try {
    const { userId, id } = await identity(request, context);
    if (new URL(request.url).searchParams.get('kind') === 'signature') {
      const signature = await readSignatureImage(userId, id);
      if (!signature) throw new SignatureError('签名记录不存在', 404);
      return new Response(new Uint8Array(signature.png), {
        headers: { ...signatureHeaders, 'Content-Type': 'image/png', 'Cross-Origin-Resource-Policy': 'same-origin' },
      });
    }
    const document = await findSignedDocument(userId, id);
    if (!document) throw new SignatureError('签署文件不存在', 404);
    if (document.expires_at <= new Date().toISOString()) throw new SignatureError('签署文件已过期，请重新生成', 410);
    const object = JSON.parse(document.storage_json);
    if (Number(document.file_bytes) !== object.size) throw new SignatureError('签署文件存储记录异常', 409);
    const url = await signatureStorage.downloadUrl(object, userId, id);
    return new Response(null, { status: 302, headers: { ...signatureHeaders, Location: url, 'Referrer-Policy': 'no-referrer' } });
  } catch (error) {
    return signatureFailure(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    requireImageOrigin(request);
    const { userId, id } = await identity(request, context);
    await deleteSignature(userId, id);
    return Response.json({ ok: true }, { headers: signatureHeaders });
  } catch (error) {
    return signatureFailure(error);
  }
}
