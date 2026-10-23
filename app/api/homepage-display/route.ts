import { getHomepageDisplay } from '@/lib/homepage-display-data';

export async function GET() {
  return Response.json(await getHomepageDisplay(), { headers: { 'Cache-Control': 'no-store' } });
}
