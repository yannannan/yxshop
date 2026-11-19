import { getPageMetadata } from '@/lib/page-seo-server';
export async function generateMetadata() { return getPageMetadata('serviceOrders'); }
export default function ServiceOrdersLayout({ children }: { children: React.ReactNode }) { return children; }
