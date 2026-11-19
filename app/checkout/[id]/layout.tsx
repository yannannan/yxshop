import { getPageMetadata } from '@/lib/page-seo-server';
export async function generateMetadata() { return getPageMetadata('checkout'); }
export default function CheckoutLayout({ children }: { children: React.ReactNode }) { return children; }
