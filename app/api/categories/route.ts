import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../db/setup';

type Category = { id: number; parent_id: number | null; name: string; sort: number };

export async function GET() {
  await ensureDatabase();
  const { results } = await env.DB.prepare("SELECT id,parent_id,name,sort FROM categories WHERE status='active' ORDER BY sort,id").all<Category>();
  const parents = results.filter((item) => item.parent_id === null);
  return Response.json(parents.map((parent) => ({ id: parent.id, name: parent.name, children: results.filter((item) => item.parent_id === parent.id).map((item) => ({ id: item.id, name: item.name })) })));
}
