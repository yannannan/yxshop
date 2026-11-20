import { requireImageOrigin } from '@/lib/image-request';
import { ImageToolError, imageTaskId } from '@/lib/image-tool';
import { pointsUser, PointsError } from '@/lib/points-service';
import { deleteToolResult, isToolResultKind, ToolResultError } from '@/lib/tool-result-deletion';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

export async function DELETE(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  try {
    requireImageOrigin(request);
    const user = await pointsUser(request);
    if (!user) throw new ToolResultError('请登录后管理自己的制作记录', 401);
    const { kind, id } = await params;
    if (!isToolResultKind(kind) || !imageTaskId(id)) throw new ToolResultError('制作记录不存在', 404);
    await deleteToolResult(user.id, kind, id.toLowerCase());
    return Response.json({ ok: true }, { headers });
  } catch (error) {
    const known = error instanceof ToolResultError || error instanceof PointsError || error instanceof ImageToolError;
    if (!known) console.error('制作记录删除失败', (error as { code?: string })?.code || (error as Error)?.name);
    return Response.json({ message: known ? error.message : '删除暂不可用，请稍后重试' }, { status: known ? error.status : 503, headers });
  }
}
