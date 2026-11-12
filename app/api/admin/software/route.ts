import { adminDenied, getAdminContext, hasAdminPermission } from '@/lib/admin-auth';
import { requireImageOrigin } from '@/lib/image-request';
import { createSoftwareRelease, editSoftwareRelease, publishSoftwareRelease, saveSoftwarePage, softwareAdmin, softwareFailure, unpublishSoftwareRelease } from '@/lib/software-release-service';
export async function GET(request: Request) {
  const admin = await getAdminContext(request); if (!admin || !hasAdminPermission(admin, 'tools')) return adminDenied();
  try { const id = Number(new URL(request.url).searchParams.get('tool')); if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ message: '工具参数不正确' }, { status: 400 }); return Response.json(await softwareAdmin(id), { headers: { 'Cache-Control': 'private, no-store' } }); } catch (error) { return softwareFailure(error); }
}
export async function POST(request: Request) {
  const admin = await getAdminContext(request); if (!admin || !hasAdminPermission(admin, 'tools')) return adminDenied();
  try {
    requireImageOrigin(request); const raw = await request.text(); if (raw.length > 80000) return Response.json({ message: '发布信息过大' }, { status: 413 }); const body = JSON.parse(raw), id = Number(body?.tool);
    if (!body || !Number.isSafeInteger(id) || id <= 0) return Response.json({ message: '工具参数不正确' }, { status: 400 });
    if (body.action === 'page') await saveSoftwarePage(id, body.page);
    else if (body.action === 'create') return Response.json({ ok: true, id: await createSoftwareRelease(id, admin.admin.id, body) });
    else if (body.action === 'edit') await editSoftwareRelease(id, body.id, body);
    else if (body.action === 'publish') await publishSoftwareRelease(id, body.id);
    else if (body.action === 'unpublish') await unpublishSoftwareRelease(id, body.id);
    else return Response.json({ message: '未知软件发布操作' }, { status: 400 });
    return Response.json({ ok: true });
  } catch (error) { return softwareFailure(error); }
}
