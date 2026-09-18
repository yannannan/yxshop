import { env } from '@/db/mysql-runtime';
import { getVerifiedSessionPhone } from '@/db/setup';

export type AdminMenuRow = {
  id: number;
  parent_id: number | null;
  menu_code: string;
  menu_name: string;
  component_key: string;
  icon: string;
  menu_type: 'directory' | 'menu';
  sort_order: number;
  visible: number;
  status: 'active' | 'disabled';
};

export type AdminMenuNode = AdminMenuRow & { children: AdminMenuNode[] };

export type AdminContext = {
  admin: {
    id: number;
    username: string;
    displayName: string;
  };
  roleCodes: string[];
  menuCodes: string[];
  menuTree: AdminMenuNode[];
  superAdmin: boolean;
};

const LEGACY_ADMIN_PHONE = process.env.ADMIN_PHONE || '13564802098';

function buildMenuTree(rows: AdminMenuRow[]) {
  const map = new Map<number, AdminMenuNode>();
  rows.forEach((row) => map.set(Number(row.id), {
    ...row,
    id: Number(row.id),
    parent_id: row.parent_id === null ? null : Number(row.parent_id),
    children: [],
  }));
  const roots: AdminMenuNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.children.push(node);
    else roots.push(node);
  }
  const sort = (items: AdminMenuNode[]) => {
    items.sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

async function bootstrapLegacyAdmin(phone: string) {
  if (phone !== LEGACY_ADMIN_PHONE) return null;
  const now = new Date().toISOString();
  const role = await env.DB.prepare("SELECT id FROM sys_role WHERE role_code='super_admin' AND status='active'").first<{ id: number }>();
  if (!role) return null;
  let admin = await env.DB.prepare("SELECT id,username,display_name,status FROM sys_admin_user WHERE username=?").bind(phone).first<{ id: number; username: string; display_name: string; status: string }>();
  if (!admin) {
    const result = await env.DB.prepare("INSERT INTO sys_admin_user (username,display_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(phone, '管理员', '', 'active', now, now).run();
    admin = { id: result.meta.last_row_id, username: phone, display_name: '管理员', status: 'active' };
  } else {
    await env.DB.prepare("UPDATE sys_admin_user SET status='active',updated_at=? WHERE id=?").bind(now, admin.id).run();
  }
  await env.DB.prepare("INSERT IGNORE INTO sys_admin_user_role (admin_user_id,role_id) VALUES (?,?)").bind(admin.id, role.id).run();
  return admin;
}

export async function getAdminContext(request: Request): Promise<AdminContext | null> {
  const phone = getVerifiedSessionPhone(request);
  if (!phone) return null;

  try {
    let admin = await env.DB.prepare("SELECT id,username,display_name,status FROM sys_admin_user WHERE username=?").bind(phone).first<{ id: number; username: string; display_name: string; status: string }>();
    if (!admin) admin = await bootstrapLegacyAdmin(phone) as typeof admin;
    if (!admin || admin.status === 'disabled') return null;

    const { results: roles } = await env.DB.prepare(
      "SELECT r.id,r.role_code FROM sys_role r JOIN sys_admin_user_role ur ON ur.role_id=r.id WHERE ur.admin_user_id=? AND r.status='active' ORDER BY r.id"
    ).bind(admin.id).all<{ id: number; role_code: string }>();
    if (!roles.length) return null;

    const roleCodes = roles.map((role) => String(role.role_code));
    const superAdmin = roleCodes.includes('super_admin');

    let menuRows: AdminMenuRow[];
    if (superAdmin) {
      const { results } = await env.DB.prepare(
        "SELECT id,parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status FROM sys_menu WHERE status='active' ORDER BY sort_order,id"
      ).all<AdminMenuRow>();
      menuRows = results;
    } else {
      const roleIds = roles.map((role) => Number(role.id));
      const placeholders = roleIds.map(() => '?').join(',');
      const { results } = await env.DB.prepare(
        `SELECT DISTINCT m.id,m.parent_id,m.menu_code,m.menu_name,m.component_key,m.icon,m.menu_type,m.sort_order,m.visible,m.status
         FROM sys_menu m
         JOIN sys_role_menu rm ON rm.menu_id=m.id
         WHERE rm.role_id IN (${placeholders}) AND m.status='active'
         ORDER BY m.sort_order,m.id`
      ).bind(...roleIds).all<AdminMenuRow>();
      menuRows = results;

      const parentIds = Array.from(new Set(menuRows.map((menu) => Number(menu.parent_id || 0)).filter(Boolean)));
      if (parentIds.length) {
        const parentPlaceholders = parentIds.map(() => '?').join(',');
        const { results: parents } = await env.DB.prepare(
          `SELECT id,parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status FROM sys_menu WHERE id IN (${parentPlaceholders}) AND status='active'`
        ).bind(...parentIds).all<AdminMenuRow>();
        const seen = new Set(menuRows.map((menu) => Number(menu.id)));
        menuRows = [...menuRows, ...parents.filter((menu) => !seen.has(Number(menu.id)))];
      }
    }

    return {
      admin: {
        id: Number(admin.id),
        username: admin.username,
        displayName: admin.display_name || admin.username,
      },
      roleCodes,
      menuCodes: menuRows.map((menu) => menu.menu_code),
      menuTree: buildMenuTree(menuRows.filter((menu) => Number(menu.visible) === 1)),
      superAdmin,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/sys_admin_user|sys_role|sys_menu|doesn't exist|does not exist|no such table/i.test(message)) return null;
    throw error;
  }
}

export function hasAdminPermission(context: AdminContext, required: string | string[]) {
  if (context.superAdmin) return true;
  const requiredCodes = Array.isArray(required) ? required : [required];
  return requiredCodes.some((code) => context.menuCodes.includes(code));
}

export function adminDenied(message = '无后台访问权限', status = 403) {
  return Response.json({ message }, { status });
}
