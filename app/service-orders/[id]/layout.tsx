import { getPageMetadata } from '@/lib/page-seo-server';
export async function generateMetadata() { return getPageMetadata('serviceOrder'); }
export default function ServiceOrderLayout({ children }: { children: React.ReactNode }) { return children; }
