import { getPageMetadata } from '@/lib/page-seo-server';
export async function generateMetadata() { return getPageMetadata('technician'); }
export default function TechnicianLayout({ children }: { children: React.ReactNode }) { return children; }
