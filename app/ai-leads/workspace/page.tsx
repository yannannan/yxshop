import { getPageMetadata } from '@/lib/page-seo-server';
import { AiLeadsWorkspace } from '@/components/ai-leads-workspace';
export async function generateMetadata() { return getPageMetadata('aiLeadsWorkspace'); }
export default function AiLeadsWorkspacePage() { return <AiLeadsWorkspace />; }
