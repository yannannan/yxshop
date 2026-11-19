import { getPageMetadata } from '@/lib/page-seo-server';
export async function generateMetadata() { return getPageMetadata('orders'); }
export default function OrdersLayout({ children }: { children: React.ReactNode }) { return children; }
