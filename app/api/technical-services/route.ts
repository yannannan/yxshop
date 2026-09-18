import { env } from '@/db/mysql-runtime';
import { ensureDatabase } from '../../../db/setup';
import { technicalServices as fallbackServices, type TechnicalService } from '../../../lib/technical-services';

type DbService = {
  id: number;
  slug: string;
  homepage_featured: number;
  title: string;
  summary: string;
  delivery_modes_json: string;
  coverage: string;
  pricing_mode: string;
  price: number | null;
  unit: string;
  online_response: string;
  onsite_arrival: string;
  service_includes_json: string;
  delivery_notes_json: string;
  provider_code: string;
  provider_name: string;
  initials: string;
  avatar: string;
  city: string;
  experience: string;
  role_name: string;
  intro: string;
  skills_json: string;
};

function parseArray<T>(value: string, fallback: T[] = []) {
  try {
    const result = JSON.parse(value || '[]');
    return Array.isArray(result) ? result as T[] : fallback;
  } catch {
    return fallback;
  }
}

function mapService(row: DbService): TechnicalService {
  return {
    slug: row.slug,
    providerId: row.provider_code,
    homepageFeatured: Boolean(row.homepage_featured),
    provider: row.provider_name,
    initials: row.initials,
    avatar: row.avatar,
    city: row.city,
    experience: row.experience,
    title: row.title,
    summary: row.summary,
    deliveryModes: parseArray<'online' | 'onsite'>(row.delivery_modes_json).filter((item) => item === 'online' || item === 'onsite'),
    coverage: row.coverage || undefined,
    pricingMode: row.pricing_mode === 'negotiable' ? 'negotiable' : 'fixed',
    price: row.price === null ? undefined : Number(row.price),
    unit: row.unit || undefined,
    onlineResponse: row.online_response || undefined,
    onsiteArrival: row.onsite_arrival || undefined,
    providerRole: row.role_name,
    providerIntro: row.intro,
    skills: parseArray<string>(row.skills_json),
    serviceIncludes: parseArray<{ title: string; detail: string }>(row.service_includes_json),
    deliveryNotes: parseArray<string>(row.delivery_notes_json),
  };
}

export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const homepage = url.searchParams.get('homepage') === '1';
  try {
    const where: string[] = ["s.status='active'", "p.status='active'"];
    const values: string[] = [];
    if (slug) { where.push('s.slug=?'); values.push(slug); }
    if (homepage) where.push('s.homepage_featured=1');
    const query = `SELECT s.id,s.slug,s.homepage_featured,s.title,s.summary,s.delivery_modes_json,s.coverage,s.pricing_mode,s.price,s.unit,s.online_response,s.onsite_arrival,s.service_includes_json,s.delivery_notes_json,p.provider_code,p.name AS provider_name,p.initials,p.avatar,p.city,p.experience,p.role_name,p.intro,p.skills_json FROM technical_services s JOIN technical_providers p ON p.id=s.provider_id WHERE ${where.join(' AND ')} ORDER BY s.sort_order,s.id`;
    const statement = env.DB.prepare(query);
    const { results } = values.length ? await statement.bind(...values).all<DbService>() : await statement.all<DbService>();
    const services = results.map(mapService);
    if (slug) return services[0] ? Response.json(services[0], { headers: { 'Cache-Control': 'no-store' } }) : Response.json({ message: '服务不存在' }, { status: 404 });
    return Response.json(services, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/technical_providers|technical_services|doesn't exist|does not exist|no such table/i.test(message)) {
      const services = fallbackServices.filter((service) => (!slug || service.slug === slug) && (!homepage || service.homepageFeatured));
      if (slug) return services[0] ? Response.json(services[0], { headers: { 'Cache-Control': 'no-store', 'X-Yxshop-Fallback': '1' } }) : Response.json({ message: '服务不存在' }, { status: 404 });
      return Response.json(services, { headers: { 'Cache-Control': 'no-store', 'X-Yxshop-Fallback': '1' } });
    }
    console.error('读取技术服务失败', error);
    return Response.json({ message: '技术服务读取失败' }, { status: 500 });
  }
}
