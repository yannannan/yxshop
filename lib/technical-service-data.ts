import { env } from '@/db/mysql-runtime';
import { getTechnicalService } from './technical-services';

export async function getPublishedServiceSummary(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  try {
    return await env.DB.prepare("SELECT s.slug,s.title,s.summary FROM technical_services s JOIN technical_providers p ON p.id=s.provider_id WHERE s.status='active' AND p.status='active' AND s.slug=? LIMIT 1")
      .bind(slug).first<{ slug: string; title: string; summary: string }>();
  } catch (error) {
    // Match the public service API's legacy-table fallback, without running
    // database initialization or exposing unpublished service/provider data.
    if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error;
    const service = getTechnicalService(slug);
    return service ? { slug: service.slug, title: service.title, summary: service.summary } : null;
  }
}
