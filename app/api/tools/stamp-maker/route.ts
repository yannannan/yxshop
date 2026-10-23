import { createHash } from 'node:crypto';
import { parseStampOptions, stampImageData } from '@/lib/stamp-options';
import { renderStamp } from '@/lib/stamp-renderer';
import { findStampResult, getStampTool, savePaidStamp, stampAccess, StampError, stampUser } from '@/lib/stamp-service';
import { PointsError } from '@/lib/points-service';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const validId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function failure(error: unknown) {
  if (error instanceof StampError || error instanceof PointsError) return Response.json({ message: error.message }, { status: error.status, headers });
  console.error('印章工具请求失败', error);
  const missing = ['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes((error as { code?: string }).code || '');
  return Response.json({ message: missing ? '请先执行 06 印章及 07 通用积分增量 SQL，初始化制作和积分记录。' : '制作暂不可用，请稍后重试本次制作；已成功保存的成品会直接恢复，不重复扣次。' }, { status: 503, headers });
}
export async function GET(request: Request) {
  try {
    const tool = await getStampTool(), user = await stampUser(request);
    const id = new URL(request.url).searchParams.get('result');
    if (id !== null) {
      if (!user) throw new StampError('请登录后下载自己的印章', 401);
      if (!validId(id)) throw new StampError('制作记录不存在', 404);
      const result = await findStampResult(user.id, tool.id, id.toLowerCase());
      if (!result) throw new StampError('制作记录不存在或不属于当前账号', 404);
      return Response.json({ result }, { headers });
    }
    return Response.json(await stampAccess(tool, user), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 8192) throw new StampError('印章参数过大', 413);
    const text = await request.text();
    if (text.length > 8192) throw new StampError('印章参数过大', 413);
    const body = JSON.parse(text) as { id?: unknown; options?: unknown };
    if (!body || !validId(body.id)) throw new StampError('制作任务编号不正确');
    let options;
    try { options = parseStampOptions(body.options); } catch (error) { throw new StampError((error as Error).message); }
    // 默认 PNG 延用旧参数指纹，升级前已成功的任务仍可原编号重试。
    const { format, ...legacyOptions } = options;
    const id = body.id.toLowerCase(), hash = createHash('sha256').update(JSON.stringify(format === 'png' ? legacyOptions : options)).digest('hex');
    const tool = await getStampTool(), user = await stampUser(request);
    if (tool.tool_charge_type === 'pending') throw new StampError('收费方式待确认，目前可以预览，暂未开放制作', 409);
    if (['paid', 'points'].includes(tool.tool_charge_type)) {
      if (!user) throw new StampError('请先登录后使用印章工具', 401);
      const previous = await findStampResult(user.id, tool.id, id, hash);
      if (previous) return Response.json({ result: previous }, { headers });
      const access = await stampAccess(tool, user);
      if (!access.canGenerate) throw new StampError(tool.tool_charge_type === 'points' ? '积分不足，请充值后重试' : '暂无可用套餐，请购买或续费并完成支付核验', 402);
    }
    const image = await renderStamp(options);
    const result = ['paid', 'points'].includes(tool.tool_charge_type) && user ? await savePaidStamp(user.id, tool.id, id, hash, image, options.size) : { id, ...stampImageData(image.toString('base64')), size: options.size, createdAt: new Date().toISOString(), charged: false, reused: false };
    return Response.json({ result }, { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return Response.json({ message: '印章参数格式不正确' }, { status: 400, headers });
    return failure(error);
  }
}
