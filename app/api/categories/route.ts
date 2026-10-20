import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../db/setup';

type CategoryRow = {
  id: number;
  parent_id: number | null;
  name: string;
  sort: number;
};

type CategoryNode = {
  id: number;
  name: string;
  children: CategoryNode[];
};

export async function GET() {
  await ensureDatabase();
  const { results } = await env.DB
    .prepare("SELECT id,parent_id,name,sort FROM categories WHERE status='active' ORDER BY sort,id")
    .all<CategoryRow>();

  const childrenByParent = new Map<number | null, CategoryRow[]>();
  for (const item of results) {
    const key = item.parent_id ?? null;
    const children = childrenByParent.get(key) || [];
    children.push(item);
    childrenByParent.set(key, children);
  }

  const build = (parentId: number | null, depth: number): CategoryNode[] => {
    if (depth > 3) return [];
    return (childrenByParent.get(parentId) || []).map((item) => ({
      id: item.id,
      name: item.name,
      children: build(item.id, depth + 1),
    }));
  };

  return Response.json(build(null, 1), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
