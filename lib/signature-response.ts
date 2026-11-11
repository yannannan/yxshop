import { ImageToolError } from './image-tool';
import { PointsError } from './points-service';
import { SignatureError } from './signature-tool';
import { SignatureStorageError } from './signature-oss.mjs';

export const signatureHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export function signatureFailure(error: unknown) {
  if (error instanceof SignatureError || error instanceof PointsError || error instanceof SignatureStorageError) {
    return Response.json({ message: error.message }, { status: error.status, headers: signatureHeaders });
  }
  if (error instanceof ImageToolError || error instanceof SyntaxError) {
    const status = error instanceof ImageToolError ? error.status : 400;
    const message = status === 403 ? '请从本站发起签名操作' : status === 413 ? '上传文件不得超过12MB' : '签名请求参数不正确';
    return Response.json({ message }, { status, headers: signatureHeaders });
  }
  const code = (error as { code?: string })?.code;
  console.error('文件签名服务失败', { name: (error as Error)?.name, code });
  const message = ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(code || '')
    ? (String((error as Error)?.message).includes('document_handprints') ? '请管理员先执行14号手印制作增量SQL' : '请管理员先执行13号文件签名增量SQL')
    : '文件签名暂不可用，可重试同一任务';
  return Response.json({ message }, { status: 503, headers: signatureHeaders });
}
