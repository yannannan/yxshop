import { env } from '@/db/mysql-runtime';
import { technicalServices, type TechnicalService } from './technical-services';

type Row = Record<string, unknown>;
function array<T>(value: unknown): T[] {
  try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
}
function publicService(row: Row): TechnicalService {
  return {
    slug: String(row.slug), providerId: String(row.provider_code || ''), homepageFeatured: Boolean(row.homepage_featured),
    provider: String(row.provider_name || ''), initials: String(row.initials || ''), avatar: String(row.avatar || ''),
    city: String(row.city || ''), experience: String(row.experience || ''), onlineStatus: row.online_status === 'offline' ? 'offline' : 'online',
    title: String(row.title || ''), summary: String(row.summary || ''),
    deliveryModes: array<'online' | 'onsite'>(row.delivery_modes_json).filter(mode => mode === 'online' || mode === 'onsite'),
    coverage: String(row.coverage || '') || undefined, pricingMode: row.pricing_mode === 'negotiable' ? 'negotiable' : 'fixed',
    price: row.price == null ? undefined : Number(row.price), unit: String(row.unit || '') || undefined,
    onlineResponse: String(row.online_response || '') || undefined, onsiteArrival: String(row.onsite_arrival || '') || undefined,
    providerRole: String(row.role_name || ''), providerIntro: String(row.intro || ''), skills: array<string>(row.skills_json),
    serviceIncludes: array<{ title: string; detail: string }>(row.service_includes_json), deliveryNotes: array<string>(row.delivery_notes_json),
  };
}

type Snapshot = { services: TechnicalService[]; fallback: boolean };
const cacheMs = 5000;
let snapshot: Snapshot | null = null, expiresAt = 0, inFlight: Promise<Snapshot> | null = null;

// Only public, active service/provider fields are cached. Share one in-flight
// read between metadata, SSR and the directory API; never cache failures.
export async function getPublicTechnicalCatalog(): Promise<Snapshot> {
  if (snapshot && Date.now() < expiresAt) return snapshot;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const { results } = await env.DB.prepare("SELECT s.slug,s.title,s.summary,s.homepage_featured,s.delivery_modes_json,s.coverage,s.pricing_mode,s.price,s.unit,s.online_response,s.onsite_arrival,s.service_includes_json,s.delivery_notes_json,p.provider_code,p.name AS provider_name,p.initials,p.avatar,p.city,p.experience,p.online_status,p.role_name,p.intro,p.skills_json FROM technical_services s JOIN technical_providers p ON p.id=s.provider_id WHERE s.status='active' AND p.status='active' ORDER BY s.sort_order,s.id").all<Row>();
      return { services: results.map(publicService), fallback: false };
    } catch (error) {
      if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error;
      return { services: technicalServices, fallback: true };
    }
  })();
  try { snapshot = await inFlight; expiresAt = Date.now() + cacheMs; return snapshot; }
  finally { inFlight = null; }
}

export async function getPublishedServiceSummary(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const service = (await getPublicTechnicalCatalog()).services.find(service => service.slug === slug);
  return service ? { slug: service.slug, title: service.title, summary: service.summary } : null;
}
