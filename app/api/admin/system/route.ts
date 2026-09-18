import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../../db/setup';
import { adminDenied, getAdminContext, hasAdminPermission } from '../../../../lib/admin-auth';

type MenuRow = {
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

type MenuNode = MenuRow & { children: MenuNode[] };

function buildMenuTree(rows: MenuRow[]) {
  const map = new Map<number, MenuNode>();
  rows.forEach((row) => map.set(Number(row.id), { ...row, id: Number(row.id), parent_id: row.parent_id === null ? null : Number(row.parent_id), children: [] }));
  const roots: MenuNode[] = [];
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.children.push(node);
    else roots.push(node);
  }
  const sort = (items: MenuNode[]) => {
    items.sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || Number(a.id) - Number(b.id));
    items.forEach((item) => sort(item.children));
  };
  sort(roots);
  return roots;
}

async function readSystemData() {
  const [menus, roles, roleMenus, admins, adminRoles] = await Promise.all([
    env.DB.prepare('SELECT id,parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status FROM sys_menu ORDER BY sort_order,id').all<MenuRow>(),
    env.DB.prepare('SELECT id,role_code,role_name,description,status,created_at,updated_at FROM sys_role ORDER BY id').all(),
    env.DB.prepare('SELECT role_id,menu_id FROM sys_role_menu ORDER BY role_id,menu_id').all(),
    env.DB.prepare("SELECT a.id,a.username,COALESCE(NULLIF(a.display_name,''),u.permission_type_name) AS display_name,a.status,a.created_at,a.updated_at,u.permission_type,u.permission_type_name FROM sys_admin_user a JOIN users u ON u.phone=a.username WHERE u.permission_type='10002' ORDER BY a.id").all(),
    env.DB.prepare('SELECT admin_user_id,role_id FROM sys_admin_user_role ORDER BY admin_user_id,role_id').all(),
  ]);
  return {
    initialized: true,
    menus: menus.results,
    menuTree: buildMenuTree(menus.results),
    roles: roles.results,
    roleMenus: roleMenus.results,
    admins: admins.results,
    adminRoles: adminRoles.results,
  };
}

export async function GET(request: Request) {
  await ensureDatabase();
  const admin = await getAdminContext(request);
  if (!admin) return adminDenied();
  if (!hasAdminPermission(admin, ['system-menu-management', 'system-role-management', 'system-admin-management'])) return adminDenied('无系统设置访问权限');
  try {
    return Response.json(await readSystemData(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '系统菜单读取失败';
    if (/sys_menu|sys_role|sys_admin_user|sys_admin_user_role|doesn't exist|does not exist|no such table/i.test(message)) {
      return Response.json({ initialized: false, menus: [], menuTree: [], roles: [], roleMenus: [], admins: [], adminRoles: [], message: '系统设置数据表尚未初始化，请先执行 RBAC SQL。' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    console.error('读取系统设置失败', error);
    return Response.json({ initialized: false, menus: [], menuTree: [], roles: [], roleMenus: [], admins: [], adminRoles: [], message: '系统设置读取失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  await ensureDatabase();
  const admin = await getAdminContext(request);
  if (!admin) return adminDenied();
  const body = await request.json() as Record<string, string | number>;
  const action = String(body.action || '');
  const now = new Date().toISOString();

  const requiredPermission =
    action.startsWith('menu-') ? 'system-menu-management' :
    action.startsWith('role-') ? 'system-role-management' :
    action.startsWith('admin-') ? 'system-admin-management' : '';
  if (!requiredPermission || !hasAdminPermission(admin, requiredPermission)) return adminDenied('无此系统设置操作权限');

  try {
    switch (action) {
      case 'menu-save': {
        const menuName = String(body.menuName || '').trim().slice(0, 50);
        const menuCode = String(body.menuCode || '').trim().slice(0, 64);
        const componentKey = String(body.componentKey || '').trim().slice(0, 64);
        const icon = String(body.icon || '').trim().slice(0, 20);
        const menuType = body.menuType === 'directory' ? 'directory' : 'menu';
        const parentId = Number(body.parentId || 0) || null;
        const sortOrder = Math.max(0, Number(body.sortOrder || 0));
        const visible = Number(body.visible ?? 1) ? 1 : 0;
        const status = body.status === 'disabled' ? 'disabled' : 'active';
        if (!menuName || !menuCode) return Response.json({ message: '请填写菜单名称和菜单编码' }, { status: 400 });
        if (menuType === 'menu' && !componentKey) return Response.json({ message: '功能菜单必须填写组件标识' }, { status: 400 });
        if (parentId) {
          const parent = await env.DB.prepare("SELECT id,parent_id,menu_type FROM sys_menu WHERE id=?").bind(parentId).first<{ id: number; parent_id: number | null; menu_type: string }>();
          if (!parent) return Response.json({ message: '父级菜单不存在' }, { status: 400 });
          if (parent.menu_type !== 'directory') return Response.json({ message: '只有目录菜单可以作为父级菜单' }, { status: 400 });
          if (parent.parent_id) return Response.json({ message: '当前管理端支持两级菜单，请选择顶级目录作为父级' }, { status: 400 });
          if (Number(body.id || 0) === Number(parent.id)) return Response.json({ message: '菜单不能设置自己为父级' }, { status: 400 });
        }
        const duplicate = await env.DB.prepare('SELECT id FROM sys_menu WHERE menu_code=? AND id<>?').bind(menuCode, Number(body.id || 0)).first();
        if (duplicate) return Response.json({ message: '菜单编码已存在' }, { status: 400 });
        if (body.id) {
          await env.DB.prepare('UPDATE sys_menu SET parent_id=?,menu_code=?,menu_name=?,component_key=?,icon=?,menu_type=?,sort_order=?,visible=?,status=?,updated_at=? WHERE id=?')
            .bind(parentId, menuCode, menuName, menuType === 'directory' ? '' : componentKey, icon, menuType, sortOrder, visible, status, now, body.id).run();
        } else {
          await env.DB.prepare('INSERT INTO sys_menu (parent_id,menu_code,menu_name,component_key,icon,menu_type,sort_order,visible,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
            .bind(parentId, menuCode, menuName, menuType === 'directory' ? '' : componentKey, icon, menuType, sortOrder, visible, status, now, now).run();
        }
        break;
      }
      case 'menu-status':
        await env.DB.prepare("UPDATE sys_menu SET status=?,updated_at=? WHERE id=?").bind(body.status === 'disabled' ? 'disabled' : 'active', now, body.id).run();
        break;
      case 'menu-delete': {
        const id = Number(body.id || 0);
        const children = await env.DB.prepare('SELECT COUNT(*) AS total FROM sys_menu WHERE parent_id=?').bind(id).first<{ total: number }>();
        if (Number(children?.total || 0) > 0) return Response.json({ message: '请先删除该菜单下的子菜单' }, { status: 400 });
        await env.DB.batch([
          env.DB.prepare('DELETE FROM sys_role_menu WHERE menu_id=?').bind(id),
          env.DB.prepare('DELETE FROM sys_menu WHERE id=?').bind(id),
        ]);
        break;
      }
      case 'role-save': {
        const roleName = String(body.roleName || '').trim().slice(0, 50);
        const roleCode = String(body.roleCode || '').trim().slice(0, 64);
        const description = String(body.description || '').trim().slice(0, 255);
        const status = body.status === 'disabled' ? 'disabled' : 'active';
        if (!roleName || !roleCode) return Response.json({ message: '请填写角色名称和角色编码' }, { status: 400 });
        const duplicate = await env.DB.prepare('SELECT id FROM sys_role WHERE role_code=? AND id<>?').bind(roleCode, Number(body.id || 0)).first();
        if (duplicate) return Response.json({ message: '角色编码已存在' }, { status: 400 });
        if (body.id) {
          const currentRole = await env.DB.prepare('SELECT role_code FROM sys_role WHERE id=?').bind(body.id).first<{ role_code: string }>();
          if (currentRole?.role_code === 'super_admin' && (roleCode !== 'super_admin' || status !== 'active')) return Response.json({ message: '超级管理员角色编码和启用状态不能修改' }, { status: 400 });
          await env.DB.prepare('UPDATE sys_role SET role_code=?,role_name=?,description=?,status=?,updated_at=? WHERE id=?').bind(roleCode, roleName, description, status, now, body.id).run();
        } else {
          await env.DB.prepare('INSERT INTO sys_role (role_code,role_name,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(roleCode, roleName, description, status, now, now).run();
        }
        break;
      }
      case 'role-menu-save': {
        const roleId = Number(body.roleId || 0);
        const role = await env.DB.prepare('SELECT id FROM sys_role WHERE id=?').bind(roleId).first();
        if (!role) return Response.json({ message: '角色不存在' }, { status: 404 });
        const menuIds = String(body.menuIds || '').split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0);
        const statements = [env.DB.prepare('DELETE FROM sys_role_menu WHERE role_id=?').bind(roleId)];
        for (const menuId of Array.from(new Set(menuIds))) statements.push(env.DB.prepare('INSERT INTO sys_role_menu (role_id,menu_id) VALUES (?,?)').bind(roleId, menuId));
        await env.DB.batch(statements);
        break;
      }
      case 'role-status': {
        const role = await env.DB.prepare('SELECT role_code FROM sys_role WHERE id=?').bind(body.id).first<{ role_code: string }>();
        if (role?.role_code === 'super_admin' && body.status === 'disabled') return Response.json({ message: '超级管理员角色不能停用' }, { status: 400 });
        await env.DB.prepare('UPDATE sys_role SET status=?,updated_at=? WHERE id=?').bind(body.status === 'disabled' ? 'disabled' : 'active', now, body.id).run();
        break;
      }
      case 'role-delete': {
        const id = Number(body.id || 0);
        const role = await env.DB.prepare('SELECT role_code FROM sys_role WHERE id=?').bind(id).first<{ role_code: string }>();
        if (!role) return Response.json({ message: '角色不存在' }, { status: 404 });
        if (role.role_code === 'super_admin') return Response.json({ message: '超级管理员角色不能删除' }, { status: 400 });
        await env.DB.batch([
          env.DB.prepare('DELETE FROM sys_admin_user_role WHERE role_id=?').bind(id),
          env.DB.prepare('DELETE FROM sys_role_menu WHERE role_id=?').bind(id),
          env.DB.prepare('DELETE FROM sys_role WHERE id=?').bind(id),
        ]);
        break;
      }
      case 'admin-save': {
        const id = Number(body.id || 0);
        const username = String(body.username || '').trim();
        const displayName = String(body.displayName || '').trim().slice(0, 50);
        const status = body.status === 'disabled' ? 'disabled' : 'active';
        if (!/^1\d{10}$/.test(username)) return Response.json({ message: '管理员账号请填写 11 位登录手机号' }, { status: 400 });
        if (!displayName) return Response.json({ message: '请填写管理员名称' }, { status: 400 });
        const user = await env.DB.prepare('SELECT id,phone FROM users WHERE phone=?').bind(username).first<{ id: number; phone: string }>();
        if (!user) return Response.json({ message: '该手机号尚未注册商城账号，请先完成用户注册' }, { status: 400 });
        const duplicate = await env.DB.prepare('SELECT id FROM sys_admin_user WHERE username=? AND id<>?').bind(username, id).first();
        if (duplicate) return Response.json({ message: '该手机号已经是管理员' }, { status: 400 });
        if (id) {
          if (id === admin.admin.id && status === 'disabled') return Response.json({ message: '不能停用当前登录管理员' }, { status: 400 });
          const currentAdmin = await env.DB.prepare('SELECT username FROM sys_admin_user WHERE id=?').bind(id).first<{ username: string }>();
          if (!currentAdmin) return Response.json({ message: '管理员不存在' }, { status: 404 });
          if (username !== currentAdmin.username) return Response.json({ message: '已有管理员不能直接修改登录手机号，请先取消原用户管理权限后再设置新用户' }, { status: 400 });
          await env.DB.prepare('UPDATE sys_admin_user SET display_name=?,status=?,updated_at=? WHERE id=?').bind(displayName, status, now, id).run();
        } else {
          const created = await env.DB.prepare("INSERT INTO sys_admin_user (username,display_name,password_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(username, displayName, '', status, now, now).run();
          const role = await env.DB.prepare("SELECT id FROM sys_role WHERE role_code='super_admin' AND status='active'").first<{ id: number }>();
          if (role) await env.DB.prepare('INSERT IGNORE INTO sys_admin_user_role (admin_user_id,role_id) VALUES (?,?)').bind(Number(created.meta.last_row_id), role.id).run();
        }
        await env.DB.prepare('UPDATE users SET permission_type=?,permission_type_name=? WHERE phone=?').bind(status === 'active' ? '10002' : '10001', status === 'active' ? '超级管理员' : '普通用户', username).run();
        break;
      }
      case 'admin-role-save': {
        const adminUserId = Number(body.adminUserId || 0);
        const target = await env.DB.prepare('SELECT id FROM sys_admin_user WHERE id=?').bind(adminUserId).first();
        if (!target) return Response.json({ message: '管理员不存在' }, { status: 404 });
        const roleIds = Array.from(new Set(String(body.roleIds || '').split(',').map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value > 0)));
        if (!roleIds.length) return Response.json({ message: '请至少分配一个角色' }, { status: 400 });
        const placeholders = roleIds.map(() => '?').join(',');
        const { results: validRoles } = await env.DB.prepare(`SELECT id,role_code FROM sys_role WHERE id IN (${placeholders}) AND status='active'`).bind(...roleIds).all<{ id: number; role_code: string }>();
        if (validRoles.length !== roleIds.length) return Response.json({ message: '包含不存在或已停用的角色' }, { status: 400 });
        if (adminUserId === admin.admin.id && !validRoles.some((role) => role.role_code === 'super_admin')) return Response.json({ message: '当前登录管理员必须保留超级管理员角色' }, { status: 400 });
        const statements = [env.DB.prepare('DELETE FROM sys_admin_user_role WHERE admin_user_id=?').bind(adminUserId)];
        for (const roleId of roleIds) statements.push(env.DB.prepare('INSERT INTO sys_admin_user_role (admin_user_id,role_id) VALUES (?,?)').bind(adminUserId, roleId));
        await env.DB.batch(statements);
        break;
      }
      case 'admin-status': {
        const id = Number(body.id || 0);
        const status = body.status === 'disabled' ? 'disabled' : 'active';
        if (id === admin.admin.id && status === 'disabled') return Response.json({ message: '不能停用当前登录管理员' }, { status: 400 });
        const target = await env.DB.prepare('SELECT username FROM sys_admin_user WHERE id=?').bind(id).first<{ username: string }>();
        if (!target) return Response.json({ message: '管理员不存在' }, { status: 404 });
        await env.DB.batch([
          env.DB.prepare('UPDATE sys_admin_user SET status=?,updated_at=? WHERE id=?').bind(status, now, id),
          env.DB.prepare('UPDATE users SET permission_type=?,permission_type_name=? WHERE phone=?').bind(status === 'active' ? '10002' : '10001', status === 'active' ? '超级管理员' : '普通用户', target.username),
        ]);
        break;
      }
      case 'admin-delete': {
        const id = Number(body.id || 0);
        if (id === admin.admin.id) return Response.json({ message: '不能删除当前登录管理员' }, { status: 400 });
        const target = await env.DB.prepare('SELECT id,username FROM sys_admin_user WHERE id=?').bind(id).first<{ id: number; username: string }>();
        if (!target) return Response.json({ message: '管理员不存在' }, { status: 404 });
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET permission_type=?,permission_type_name=? WHERE phone=?').bind('10001', '普通用户', target.username),
          env.DB.prepare('DELETE FROM sys_admin_user_role WHERE admin_user_id=?').bind(id),
          env.DB.prepare('DELETE FROM sys_admin_user WHERE id=?').bind(id),
        ]);
        break;
      }
      default:
        return Response.json({ message: '未知系统设置操作' }, { status: 400 });
    }
    return Response.json({ ok: true, ...(await readSystemData()) });
  } catch (error) {
    console.error('系统设置操作失败', error);
    const message = error instanceof Error ? error.message : '系统设置操作失败';
    if (/sys_menu|sys_role|sys_admin_user|sys_admin_user_role|doesn't exist|does not exist|no such table/i.test(message)) {
      return Response.json({ message: '系统设置数据表尚未初始化，请先执行 RBAC SQL。' }, { status: 503 });
    }
    return Response.json({ message: '系统设置操作失败，请检查数据库配置' }, { status: 500 });
  }
}
