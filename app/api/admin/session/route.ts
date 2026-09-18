import { ensureDatabase } from '../../../../db/setup';
import { adminDenied, getAdminContext } from '../../../../lib/admin-auth';

export async function GET(request: Request) {
  await ensureDatabase();
  const context = await getAdminContext(request);
  if (!context) return adminDenied('当前账号没有后台访问权限');
  return Response.json({
    authenticated: true,
    admin: context.admin,
    roleCodes: context.roleCodes,
    menuCodes: context.menuCodes,
    menuTree: context.menuTree,
    superAdmin: context.superAdmin,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
