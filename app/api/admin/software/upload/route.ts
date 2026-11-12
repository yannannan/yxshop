import { adminDenied, getAdminContext, hasAdminPermission } from '@/lib/admin-auth';
import { requireImageOrigin } from '@/lib/image-request';
import { softwareUploadLimit } from '@/lib/software-release';
import { softwareFailure, uploadSoftwareInstaller } from '@/lib/software-release-service';
export async function POST(request: Request) {
  const admin = await getAdminContext(request); if (!admin || !hasAdminPermission(admin, 'tools')) return adminDenied();
  try {
    requireImageOrigin(request);
    const params = new URL(request.url).searchParams, tool = Number(params.get('tool')), id = params.get('release') || '', size = Number(request.headers.get('x-file-size'));
    if (!Number.isSafeInteger(tool) || tool <= 0 || !Number.isSafeInteger(size) || size < 64 || size > softwareUploadLimit) return Response.json({ message: '安装包参数无效，EXE最大256MB' }, { status: 400 });
    const name = decodeURIComponent(request.headers.get('x-file-name') || '');
    return Response.json({ ok: true, ...await uploadSoftwareInstaller(tool, id, request, name, size) });
  } catch (error) { return softwareFailure(error); }
}
