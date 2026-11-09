import { isStampId } from './stamp-options';
import { stampResultPng } from './stamp-renderer';
import { findStampResult, findStampTool, listStampResults } from './stamp-service';
import { signatureApi, type SavedStamp } from './signature-tool';

export async function listSigningStamps(userId: number): Promise<SavedStamp[]> {
  const tool = await findStampTool();
  if (!tool) return [];
  try {
    const stamps = await listStampResults(userId, tool.id, 30);
    return stamps.filter(stamp => isStampId(stamp.id)).map(stamp => ({
      id: stamp.id,
      width: Number(stamp.size),
      height: Number(stamp.size),
      createdAt: stamp.createdAt,
      previewUrl: `${signatureApi}/${stamp.id}?kind=stamp`,
    }));
  } catch (error) {
    if ((error as { code?: string })?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

export async function readSigningStamp(userId: number, productId: number, id: string, preview = false) {
  const stamp = await findStampResult(userId, productId, id.toLowerCase());
  return stamp ? stampResultPng(stamp, preview ? 240 : 600) : null;
}
