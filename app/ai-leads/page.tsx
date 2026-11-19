import { getPageMetadata } from '@/lib/page-seo-server';
import { AiLeadsLanding } from '@/components/ai-leads-landing';
export async function generateMetadata() { return getPageMetadata('aiLeads'); }
export default function AiLeadsPage() { return <AiLeadsLanding />; }
