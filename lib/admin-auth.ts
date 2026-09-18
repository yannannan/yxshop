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

async function ensureSuperAdminRecord(phone: string) {
  const now = new Date().toISOString();
  const role = await env.DB.prepare("SELECT id FROM sys_role WHERE role_code='super_admin' AND status='active'").first<{ id: number }>();
  if (!role) return null;

  let admin = await env.DB.prepare(
    'SELECT id,username,display_name,status FROM sys_admin_user WHERE username=?'
  ).bind(phone).first<{ id: number; username: string; display_name: string; status: string }>();

  if (!admin) {
    const result = await env.DB.prepare(
      'INSERT INTO sys_admin_user (username,display_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?)'
    ).bind(phone, '超级管理员', '', 'active', now, now).run();
    admin = {
      id: Number(result.meta.last_row_id),
      username: phone,
      display_name: '超级管理员',
      status: 'active',
    };
  } else {
    await env.DB.prepare(
      "UPDATE sys_admin_user SET display_name=CASE WHEN display_name='' THEN '超级管理员' ELSE display_name END,status='active',updated_at=? WHERE id=?"
    ).bind(now, admin.id).run();
    admin = { ...admin, status: 'active' };
  }

  await env.DB.prepare(
    'INSERT IGNORE INTO sys_admin_user_role (admin_user_id,role_id) VALUES (?,?)'
  ).bind(admin.id, role.id).run();

  return admin;
}

export async function getAdminContext(request: Request): Promise<AdminContext | null> {
  const phone = getVerifiedSessionPhone(request);
  if (!phone) return null;

  try {
    const user = await env.DB.prepare(
      'SELECT id,phone,status,permission_type,permission_type_name FROM users WHERE phone=?'
    ).bind(phone).first<{
      id: number;
      phone: string;
      status: string;
      permission_type: string;
      permission_type_name: string;
    }>();

    // users.permission_type 是后台访问的唯一权限入口：
    // 10001 普通用户；10002 超级管理员。
    if (!user || user.status !== 'active' || user.permission_type !== '10002') return null;

    const admin = await ensureSuperAdminRecord(phone);
    if (!admin) return null;

    const { results: menuRows } = await env.DB.prepare(
      "SELECT id,parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status FROM sys_menu WHERE status='active' ORDER BY sort_order,id"
    ).all<AdminMenuRow>();

    return {
      admin: {
        id: Number(admin.id),
        username: phone,
        displayName: user.permission_type_name || admin.display_name || '超级管理员',
      },
      roleCodes: ['super_admin'],
      menuCodes: menuRows.map((menu) => menu.menu_code),
      menuTree: buildMenuTree(menuRows.filter((menu) => Number(menu.visible) === 1)),
      superAdmin: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/permission_type|permission_type_name|sys_admin_user|sys_role|sys_menu|doesn't exist|does not exist|no such table|unknown column/i.test(message)) return null;
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
